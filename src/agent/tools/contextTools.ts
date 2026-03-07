import { AgentTool } from './types';

export class BuildVideoContextTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            context: {
                sourceType: 'video',
                videoUrl: input.videoUrl,
                channelCategory: input.channelCategory ?? 'unknown',
                taskType: input.taskType,
            },
        };
    }
}

export class BuildClipContextTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            context: {
                sourceType: 'clip',
                clipContext: input.clipContext ?? {},
                channelCategory: input.channelCategory ?? 'unknown',
                taskType: input.taskType,
            },
        };
    }
}

export class PrepareReviewPayloadTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = input.context as Record<string, unknown>;
        return {
            reviewPayload: {
                summary: `Task ${input.taskType} is ready for human review.`,
                context,
                recommendation: 'review_required',
            },
        };
    }
}
