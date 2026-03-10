import { z } from 'zod';

export const taskIdParamSchema = z.object({
    taskId: z.string().trim().min(1, 'taskId값이 없습니다.'),
});

export const evaluationIdParamSchema = z.object({
    evaluationId: z.string().trim().min(1, 'evaluationId값이 없습니다.'),
});

export const canaryDecisionSchema = z.object({
    routingKey: z.string().trim().min(1, 'routingKey값이 없습니다.'),
});

const clipContextSchema = z.object({
    clipId: z.string().trim().min(1).optional(),
    clipLink: z.string().trim().url().optional(),
    videoId: z.string().trim().optional(),
    imageUrls: z.array(z.string().trim().url()).optional().default([]),
    startSec: z.coerce.number().min(0).optional(),
    endSec: z.coerce.number().min(0).optional(),
    channelName: z.string().trim().optional(),
    videoTitle: z.string().trim().optional(),
    spokenText: z.string().trim().optional(),
}).superRefine((value, ctx) => {
    if (value.startSec !== undefined && value.endSec !== undefined && value.endSec <= value.startSec) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'clipContext.endSec는 startSec보다 커야 합니다.',
            path: ['endSec'],
        });
    }
});

export const createAgentTaskSchema = z.object({
    taskType: z.enum(['AUTO_PRODUCT_FROM_VIDEO', 'AUTO_PRODUCT_FROM_CLIP']),
    videoUrl: z.string().trim().url().optional(),
    channelCategory: z.string().trim().optional(),
    clipContext: clipContextSchema.optional(),
    legacyCandidates: z.array(z.string().trim().min(1)).optional().default([]),
}).superRefine((value, ctx) => {
    if (value.taskType === 'AUTO_PRODUCT_FROM_CLIP' && !value.clipContext) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AUTO_PRODUCT_FROM_CLIP에는 clipContext가 필요합니다.',
            path: ['clipContext'],
        });
    }

    if (value.taskType === 'AUTO_PRODUCT_FROM_CLIP' && value.clipContext) {
        const hasImageUrls = (value.clipContext.imageUrls?.length ?? 0) > 0;
        const hasSpokenText = Boolean(value.clipContext.spokenText?.trim());
        const hasClipLink = Boolean(value.clipContext.clipLink?.trim());

        if (!hasImageUrls && !hasSpokenText && !hasClipLink) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'AUTO_PRODUCT_FROM_CLIP에는 imageUrls, spokenText, clipLink 중 하나가 필요합니다.',
                path: ['clipContext'],
            });
        }
    }
});

export const retryTaskSchema = z.object({
    fromStepId: z.string().trim().optional(),
});

export const reviewTaskSchema = z.object({
    approved: z.array(z.number().int()).default([]),
    comment: z.string().trim().optional(),
});

export const dualRunEvaluationSchema = z.object({
    input: createAgentTaskSchema,
    goldLabel: z.string().trim().optional(),
    evaluationName: z.string().trim().optional(),
    iterations: z.coerce.number().int().min(1).max(10).optional().default(3),
});

export const updateCanaryConfigSchema = z.object({
    rolloutPercentage: z.coerce.number().int().min(0).max(100).optional(),
    forceStrategy: z.enum(['agent', 'legacy']).optional(),
}).refine((value) => value.rolloutPercentage !== undefined || value.forceStrategy !== undefined, {
    message: 'rolloutPercentage 또는 forceStrategy 중 하나는 필요합니다.',
});
