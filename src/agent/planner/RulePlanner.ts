import { AgentTaskInput, Plan } from '../core/types';

export class RulePlanner {
    createPlan(input: AgentTaskInput): Plan {
        if (input.taskType === 'AUTO_PRODUCT_FROM_VIDEO') {
            return {
                version: 'video-v2',
                steps: [
                    {
                        stepId: 'extract-frames',
                        tool: 'video_frame_extractor',
                        input: {
                            localVideoPath: '{{input.localVideoPath}}',
                            frameIntervalSec: 5,
                            maxFrames: 6,
                        },
                    },
                    {
                        stepId: 'build-video-context',
                        tool: 'build_video_context',
                        input: {
                            videoUrl: input.videoUrl,
                            channelCategory: input.channelCategory ?? 'unknown',
                            taskType: input.taskType,
                            clipContext: {
                                imageUrls: '{{extract-frames.output.imageUrls}}',
                                localVideoPath: '{{input.localVideoPath}}',
                                videoTitle: input.clipContext?.videoTitle,
                                channelName: input.clipContext?.channelName,
                            },
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

        // AUTO_PRODUCT_FROM_CLIP (기존)
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
