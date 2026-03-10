import { z } from 'zod';
import { GeminiProvider, geminiProvider } from '../providers/llm/GeminiProvider';
import { ProductCandidate, VisionProductResult } from '../workflows/productTypes';

const visionProductSchema = z.object({
    name: z.string().trim().min(1),
    brand: z.string().trim().min(1).nullable(),
    category: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    evidence: z.string().trim().min(1),
    searchQuery: z.string().trim().min(1),
});

const visionOutputSchema = z.object({
    products: z.array(visionProductSchema).default([]),
    sceneDescription: z.string().trim().default(''),
    uncertainty: z.string().trim().nullable().default(null),
});

interface VisionToolInput {
    imageUrls?: string[];
    channelCategory?: string;
    channelName?: string;
    videoTitle?: string;
    videoUrl?: string;
    candidateHints?: string[];
}

interface VisionToolDeps {
    provider?: Pick<GeminiProvider, 'generateObject'>;
    escalationThreshold?: number;
}

function toProductCandidate(product: z.infer<typeof visionProductSchema>): ProductCandidate {
    return {
        ...product,
        source: 'vision',
    };
}

function buildVisionPrompt(input: VisionToolInput): string {
    const hints = input.candidateHints?.length ? input.candidateHints.join(', ') : '없음';

    return [
        `카테고리: ${input.channelCategory ?? 'unknown'}`,
        `채널명: ${input.channelName ?? 'unknown'}`,
        `영상 제목: ${input.videoTitle ?? 'unknown'}`,
        `영상 URL: ${input.videoUrl ?? 'unknown'}`,
        `기존 후보: ${hints}`,
        '이미지에서 보이는 상품을 최대 3개까지 식별하세요.',
        '가격은 추론하지 말고, 확신이 낮으면 confidence를 낮게 주세요.',
    ].join('\n');
}

export class VisionProductTool {
    private readonly escalationThreshold: number;

    constructor(private readonly deps: VisionToolDeps = {}) {
        this.escalationThreshold = deps.escalationThreshold ?? 0.7;
    }

    async identify(input: VisionToolInput): Promise<VisionProductResult> {
        const imageUrls = (input.imageUrls ?? []).filter(Boolean).slice(0, 3);

        if (!imageUrls.length) {
            return {
                products: [],
                sceneDescription: 'No image URLs provided.',
                uncertainty: 'image_urls_missing',
                policyUsed: 'mini-default',
                escalated: false,
            };
        }

        const primary = await this.executePolicy('mini-default', imageUrls, input);
        const topPrimaryConfidence = primary.products[0]?.confidence ?? 0;

        if (topPrimaryConfidence >= this.escalationThreshold || !primary.products.length) {
            return {
                ...primary,
                policyUsed: 'mini-default',
                escalated: false,
            };
        }

        const escalated = await this.executePolicy('4o-escalation', imageUrls, input);
        const topEscalatedConfidence = escalated.products[0]?.confidence ?? 0;

        if (topEscalatedConfidence >= topPrimaryConfidence) {
            return {
                ...escalated,
                policyUsed: '4o-escalation',
                escalated: true,
            };
        }

        return {
            ...primary,
            uncertainty: primary.uncertainty ?? escalated.uncertainty,
            policyUsed: 'mini-default',
            escalated: true,
        };
    }

    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const vision = await this.identify({
            imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls.filter((url): url is string => typeof url === 'string') : [],
            channelCategory: typeof input.channelCategory === 'string' ? input.channelCategory : undefined,
            channelName: typeof input.channelName === 'string' ? input.channelName : undefined,
            videoTitle: typeof input.videoTitle === 'string' ? input.videoTitle : undefined,
            videoUrl: typeof input.videoUrl === 'string' ? input.videoUrl : undefined,
            candidateHints: Array.isArray(input.candidateHints) ? input.candidateHints.filter((item): item is string => typeof item === 'string') : [],
        });

        return { vision };
    }

    private async executePolicy(
        policy: 'mini-default' | '4o-escalation',
        imageUrls: string[],
        input: VisionToolInput,
    ): Promise<Omit<VisionProductResult, 'policyUsed' | 'escalated'>> {
        const response = await (this.deps.provider ?? geminiProvider).generateObject({
            policy,
            schema: visionOutputSchema,
            temperature: 0.1,
            maxOutputTokens: 4096,
            messages: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'text',
                            text: [
                                'Return a single JSON object with exactly this structure:',
                                '{',
                                '  "products": [{"name": "string", "brand": "string or null", "category": "string", "confidence": 0.0-1.0, "evidence": "string", "searchQuery": "string"}],',
                                '  "sceneDescription": "string",',
                                '  "uncertainty": "string or null"',
                                '}',
                                'Always wrap results in this object. Never return a bare array.',
                                'Identify visible products conservatively. Never invent prices.',
                            ].join('\n'),
                        },
                    ],
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: buildVisionPrompt(input),
                        },
                        ...imageUrls.map((url) => ({
                            type: 'image_url' as const,
                            image_url: {
                                url,
                                detail: 'low' as const,
                            },
                        })),
                    ],
                },
            ],
        });

        return {
            products: response.object.products.map(toProductCandidate),
            sceneDescription: response.object.sceneDescription,
            uncertainty: response.object.uncertainty,
        };
    }
}
