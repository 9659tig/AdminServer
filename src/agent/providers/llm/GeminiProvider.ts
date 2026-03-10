import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { ZodTypeAny } from 'zod';
import { getEnv } from '../../../config/env';
import { logger } from '../../../config/logger';
import { modelPolicyRegistry } from './modelPolicy';
import {
    LlmGeneratedObject,
    LlmImageContentPart,
    LlmMessage,
    LlmObjectRequest,
    LlmTextContentPart,
    ModelPolicyRegistry,
} from './types';

interface GeminiProviderDeps {
    policyRegistry?: ModelPolicyRegistry;
    apiKey?: string;
}

function extractBase64(dataUri: string): { data: string; mimeType: string } | null {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !match[1] || !match[2]) return null;
    return { mimeType: match[1], data: match[2] };
}

function buildParts(messages: LlmMessage[]): { systemInstruction?: string; parts: Part[] } {
    let systemInstruction: string | undefined;
    const parts: Part[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            if (typeof msg.content === 'string') {
                systemInstruction = msg.content;
            } else if (Array.isArray(msg.content)) {
                systemInstruction = (msg.content as LlmTextContentPart[])
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('\n');
            }
        } else if (msg.role === 'user') {
            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            } else if (Array.isArray(msg.content)) {
                for (const part of msg.content as Array<LlmTextContentPart | LlmImageContentPart>) {
                    if (part.type === 'text') {
                        parts.push({ text: part.text });
                    } else if (part.type === 'image_url') {
                        const url = part.image_url.url;
                        if (url.startsWith('data:')) {
                            const parsed = extractBase64(url);
                            if (parsed) {
                                parts.push({ inlineData: { data: parsed.data, mimeType: parsed.mimeType } });
                            }
                        }
                        // 외부 URL 이미지는 현재 지원하지 않음 (base64만 사용)
                    }
                }
            }
        }
    }

    return { systemInstruction, parts };
}

// 코드 펜스 제거 및 잘린 JSON 복구
function parseJsonSafe(raw: string): unknown {
    // 1. 마크다운 코드 펜스 제거
    let text = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    // 2. 정상 파싱 시도
    try {
        return JSON.parse(text);
    } catch {
        // 3. 잘린 JSON 복구: 마지막으로 완전히 닫힌 { } 위치까지 자르기
        const lastBrace = findLastCompleteObject(text);
        if (lastBrace !== null) {
            try {
                return JSON.parse(lastBrace);
            } catch { /* 복구 실패 시 원본 오류 유지 */ }
        }
        throw new SyntaxError(`Invalid JSON from Gemini: ${raw.slice(0, 120)}`);
    }
}

function findLastCompleteObject(text: string): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastCompleteEnd = -1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) lastCompleteEnd = i;
        }
    }

    return lastCompleteEnd >= 0 ? text.slice(0, lastCompleteEnd + 1) : null;
}

function buildMessagesFromPrompts(systemPrompt?: string, userPrompt?: string): LlmMessage[] {
    const messages: LlmMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    if (userPrompt)   messages.push({ role: 'user',   content: userPrompt });
    return messages;
}

export class GeminiProvider {
    private genAI?: GoogleGenerativeAI;

    constructor(private readonly deps: GeminiProviderDeps = {}) {}

    async generateObject<TSchema extends ZodTypeAny>(
        request: LlmObjectRequest<TSchema>,
    ): Promise<LlmGeneratedObject<ReturnType<TSchema['parse']>>> {
        const policy = (this.deps.policyRegistry ?? modelPolicyRegistry).resolve(request.policy);
        const messages = request.messages?.length
            ? request.messages
            : buildMessagesFromPrompts(request.systemPrompt, request.userPrompt);
        const { systemInstruction, parts } = buildParts(messages);

        const model = this.getClient().getGenerativeModel({
            model: policy.model,
            ...(systemInstruction ? { systemInstruction } : {}),
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: request.temperature ?? policy.temperature,
                maxOutputTokens: request.maxOutputTokens ?? policy.maxOutputTokens,
            },
        });

        const result = await model.generateContent(parts);
        const rawText = result.response.text().trim();

        if (!rawText) {
            throw new Error(`Gemini returned empty response for policy ${request.policy}`);
        }

        let parsedJson: unknown = parseJsonSafe(rawText);

        // Gemini가 배열을 직접 반환한 경우 object 스키마 첫 번째 array 키로 래핑 시도
        if (Array.isArray(parsedJson)) {
            const shape = (request.schema as { shape?: Record<string, unknown> }).shape ?? {};
            const arrayKey = Object.keys(shape).find((k) => {
                const field = (shape[k] as { _def?: { typeName?: string } })._def?.typeName;
                return field === 'ZodArray';
            });
            if (arrayKey) {
                parsedJson = { [arrayKey]: parsedJson };
            }
        }

        const parsed = request.schema.safeParse(parsedJson);
        if (!parsed.success) {
            const message = parsed.error.issues[0]?.message ?? 'Structured output validation failed';
            throw new Error(`Structured output validation failed for policy ${request.policy}: ${message}`);
        }

        logger.info({
            event: 'llm_object_generated',
            policy: request.policy,
            model: policy.model,
            provider: 'gemini',
        }, 'llm_object_generated');

        return {
            policy: request.policy,
            model: policy.model,
            text: rawText,
            object: parsed.data,
        };
    }

    private getClient(): GoogleGenerativeAI {
        if (!this.genAI) {
            const apiKey = this.deps.apiKey ?? getEnv().GEMINI_API_KEY;
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
        return this.genAI;
    }
}

export const geminiProvider = new GeminiProvider();
