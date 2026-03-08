import { AgentTool } from './types';

export class BuildVideoContextTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            context: {
                sourceType: 'video',
                videoUrl: input.videoUrl,
                channelCategory: input.channelCategory ?? 'unknown',
                taskType: input.taskType,
                clipContext: input.clipContext ?? undefined,
                legacyCandidates: input.legacyCandidates ?? [],
            },
        };
    }
}

export class BuildClipContextTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            context: {
                sourceType: 'clip',
                videoUrl: input.videoUrl,
                clipContext: input.clipContext ?? {},
                channelCategory: input.channelCategory ?? 'unknown',
                taskType: input.taskType,
                legacyCandidates: input.legacyCandidates ?? [],
            },
        };
    }
}

export class PrepareReviewPayloadTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const extraction = input.extraction as Record<string, unknown> | undefined;
        const context = input.context as Record<string, unknown>;

        if (extraction) {
            const selectedProduct = extraction.selectedProduct && typeof extraction.selectedProduct === 'object'
                ? extraction.selectedProduct as Record<string, unknown>
                : undefined;
            const shoppingResults = Array.isArray(extraction.shoppingResults) ? extraction.shoppingResults : [];
            const confidence = typeof extraction.confidence === 'number' ? extraction.confidence : 0;
            const productName = typeof selectedProduct?.name === 'string'
                ? selectedProduct.name
                : '상품 후보 없음';

            return {
                reviewPayload: {
                    summary: `${productName} 후보가 준비되었습니다. confidence=${confidence}`,
                    context,
                    extraction,
                    recommendation: extraction.recommendation ?? 'review_required',
                    shoppingResultCount: shoppingResults.length,
                },
            };
        }

        return {
            reviewPayload: {
                summary: `Task ${input.taskType} is ready for human review.`,
                context,
                recommendation: 'review_required',
            },
        };
    }
}
