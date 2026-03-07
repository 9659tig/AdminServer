import { AgentTaskInput, Plan } from '../core/types';

export class RulePlanner {
    createPlan(input: AgentTaskInput): Plan {
        if (input.taskType === 'AUTO_PRODUCT_FROM_VIDEO') {
            return {
                version: 'rule-v1',
                steps: [
                    {
                        stepId: 'build-video-context',
                        tool: 'build_video_context',
                        input: {
                            videoUrl: input.videoUrl,
                            channelCategory: input.channelCategory ?? 'unknown',
                            taskType: input.taskType,
                        },
                    },
                    {
                        stepId: 'prepare-review-payload',
                        tool: 'prepare_review_payload',
                        input: {
                            taskType: input.taskType,
                            context: '{{build-video-context.output.context}}',
                        },
                    },
                ],
            };
        }

        return {
            version: 'rule-v1',
            steps: [
                {
                    stepId: 'build-clip-context',
                    tool: 'build_clip_context',
                    input: {
                        clipContext: input.clipContext,
                        channelCategory: input.channelCategory ?? 'unknown',
                        taskType: input.taskType,
                    },
                },
                {
                    stepId: 'prepare-review-payload',
                    tool: 'prepare_review_payload',
                    input: {
                        taskType: input.taskType,
                        context: '{{build-clip-context.output.context}}',
                    },
                },
            ],
        };
    }
}
