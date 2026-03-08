import OpenAI from 'openai';
import { ZodTypeAny } from 'zod';
import { getEnv } from '../../../config/env';
import { logger } from '../../../config/logger';
import { ModelPolicy } from './modelPolicy';
import { modelPolicyRegistry } from './modelPolicy';
import {
    LlmGeneratedObject,
    LlmGeneratedText,
    LlmGeneratedTranscription,
    LlmMessage,
    LlmObjectRequest,
    LlmTextRequest,
    LlmTranscriptionRequest,
    ModelPolicyRegistry,
    OpenAIClientLike,
} from './types';

interface OpenAIProviderDeps {
    client?: OpenAIClientLike;
    policyRegistry?: ModelPolicyRegistry;
}

function buildMessages(request: LlmTextRequest): LlmMessage[] {
    if (request.messages?.length) {
        return request.messages;
    }

    if (!request.userPrompt) {
        throw new Error('LLM request requires either messages or userPrompt');
    }

    const messages: LlmMessage[] = [];

    if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
    }

    messages.push({ role: 'user', content: request.userPrompt });
    return messages;
}

function extractMessageText(content: unknown): string {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .map((entry) => {
                if (typeof entry === 'string') {
                    return entry;
                }

                if (entry && typeof entry === 'object' && 'text' in entry) {
                    const text = (entry as { text?: unknown }).text;
                    return typeof text === 'string' ? text : '';
                }

                return '';
            })
            .join('')
            .trim();
    }

    return '';
}

function stripJsonCodeFence(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }

    return trimmed
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

export class OpenAIProvider {
    private clientInstance?: OpenAIClientLike;

    constructor(private readonly deps: OpenAIProviderDeps = {}) {}

    async generateText(request: LlmTextRequest): Promise<LlmGeneratedText> {
        const policy = this.requirePolicyMode(request.policy, 'chat');
        const completion = await this.getClient().chat.completions.create({
            model: policy.model,
        messages: buildMessages(request),
            temperature: request.temperature ?? policy.temperature,
            max_tokens: request.maxOutputTokens ?? policy.maxOutputTokens,
        });

        const text = extractMessageText(completion.choices?.[0]?.message?.content);
        if (!text) {
            throw new Error(`OpenAI returned empty text for policy ${request.policy}`);
        }

        logger.info({
            event: 'llm_text_generated',
            policy: request.policy,
            model: policy.model,
        }, 'llm_text_generated');

        return {
            policy: request.policy,
            model: policy.model,
            text,
        };
    }

    async generateObject<TSchema extends ZodTypeAny>(request: LlmObjectRequest<TSchema>): Promise<LlmGeneratedObject<ReturnType<TSchema['parse']>>> {
        const policy = this.requirePolicyMode(request.policy, 'chat');
        const completion = await this.getClient().chat.completions.create({
            model: policy.model,
        messages: buildMessages(request),
            temperature: request.temperature ?? policy.temperature,
            max_tokens: request.maxOutputTokens ?? policy.maxOutputTokens,
            response_format: { type: 'json_object' },
        });

        const rawText = extractMessageText(completion.choices?.[0]?.message?.content);
        if (!rawText) {
            throw new Error(`OpenAI returned empty JSON payload for policy ${request.policy}`);
        }

        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(stripJsonCodeFence(rawText));
        } catch (err) {
            throw new Error(`Structured output parse failed for policy ${request.policy}: ${err instanceof Error ? err.message : String(err)}`);
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
        }, 'llm_object_generated');

        return {
            policy: request.policy,
            model: policy.model,
            text: rawText,
            object: parsed.data,
        };
    }

    async transcribe(request: LlmTranscriptionRequest): Promise<LlmGeneratedTranscription> {
        const policy = this.requirePolicyMode(request.policy, 'transcription');
        const client = this.getClient();

        if (!client.audio?.transcriptions?.create) {
            throw new Error('OpenAI audio transcription client is not available');
        }

        const response = await client.audio.transcriptions.create({
            model: policy.model,
            file: request.file,
            prompt: request.prompt,
            language: request.language,
            temperature: request.temperature ?? policy.temperature,
        });

        const text = typeof response.text === 'string' ? response.text.trim() : '';
        if (!text) {
            throw new Error(`OpenAI returned empty transcription for policy ${request.policy}`);
        }

        logger.info({
            event: 'llm_transcription_generated',
            policy: request.policy,
            model: policy.model,
        }, 'llm_transcription_generated');

        return {
            policy: request.policy,
            model: policy.model,
            text,
        };
    }

    private requirePolicyMode(name: LlmTextRequest['policy'], expectedMode: ModelPolicy['mode']): ModelPolicy {
        const policy = (this.deps.policyRegistry ?? modelPolicyRegistry).resolve(name);
        if (policy.mode !== expectedMode) {
            throw new Error(`Model policy ${name} does not support ${expectedMode}`);
        }
        return policy;
    }

    private getClient(): OpenAIClientLike {
        if (this.deps.client) {
            return this.deps.client;
        }

        if (!this.clientInstance) {
            const env = getEnv();
            this.clientInstance = new OpenAI({
                apiKey: env.OPENAI_API_KEY,
            }) as unknown as OpenAIClientLike;
        }

        return this.clientInstance;
    }
}

export const openAIProvider = new OpenAIProvider();
