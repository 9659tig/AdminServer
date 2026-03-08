import { AgentTaskInput, Plan } from '../core/types';

export class RulePlanner {
    createPlan(input: AgentTaskInput): Plan {
        const shouldUseProductWorkflow = input.taskType === 'AUTO_PRODUCT_FROM_CLIP'
            || Boolean(input.clipContext?.imageUrls?.length)
            || Boolean(input.clipContext?.spokenText?.trim());

        if (input.taskType === 'AUTO_PRODUCT_FROM_VIDEO') {
            if (!shouldUseProductWorkflow) {
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
                                clipContext: input.clipContext,
                                legacyCandidates: input.legacyCandidates ?? [],
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
                version: 'workflow-v1',
                steps: [
                    {
                        stepId: 'build-video-context',
                        tool: 'build_video_context',
                        input: {
                            videoUrl: input.videoUrl,
                            channelCategory: input.channelCategory ?? 'unknown',
                            taskType: input.taskType,
                            clipContext: input.clipContext,
                            legacyCandidates: input.legacyCandidates ?? [],
                        },
                    },
                    {
                        stepId: 'extract-product',
                        tool: 'product_extraction_workflow',
                        input: {
                            context: '{{build-video-context.output.context}}',
                        },
                    },
                    {
                        stepId: 'prepare-review-payload',
                        tool: 'prepare_review_payload',
                        input: {
                            taskType: input.taskType,
                            context: '{{build-video-context.output.context}}',
                            extraction: '{{extract-product.output.extraction}}',
                        },
                    },
                ],
            };
        }

        return {
            version: 'workflow-v1',
            steps: [
                {
                    stepId: 'build-clip-context',
                    tool: 'build_clip_context',
                    input: {
                        clipContext: input.clipContext,
                        videoUrl: input.videoUrl,
                        channelCategory: input.channelCategory ?? 'unknown',
                        taskType: input.taskType,
                        legacyCandidates: input.legacyCandidates ?? [],
                    },
                },
                {
                    stepId: 'extract-product',
                    tool: 'product_extraction_workflow',
                    input: {
                        context: '{{build-clip-context.output.context}}',
                    },
                },
                {
                    stepId: 'prepare-review-payload',
                    tool: 'prepare_review_payload',
                    input: {
                        taskType: input.taskType,
                        context: '{{build-clip-context.output.context}}',
                        extraction: '{{extract-product.output.extraction}}',
                    },
                },
            ],
        };
    }
}
