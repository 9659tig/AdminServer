import { z } from 'zod';

export const taskIdParamSchema = z.object({
    taskId: z.string().trim().min(1, 'taskId값이 없습니다.'),
});

const clipContextSchema = z.object({
    clipId: z.string().trim().min(1, 'clipId값이 없습니다.'),
    videoId: z.string().trim().optional(),
    imageUrls: z.array(z.string().trim().url()).optional().default([]),
    startSec: z.coerce.number().min(0).optional(),
    endSec: z.coerce.number().min(0).optional(),
    channelName: z.string().trim().optional(),
    videoTitle: z.string().trim().optional(),
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
}).superRefine((value, ctx) => {
    if (value.taskType === 'AUTO_PRODUCT_FROM_VIDEO' && !value.videoUrl) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AUTO_PRODUCT_FROM_VIDEO에는 videoUrl이 필요합니다.',
            path: ['videoUrl'],
        });
    }

    if (value.taskType === 'AUTO_PRODUCT_FROM_CLIP' && !value.clipContext) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'AUTO_PRODUCT_FROM_CLIP에는 clipContext가 필요합니다.',
            path: ['clipContext'],
        });
    }
});

export const retryTaskSchema = z.object({
    fromStepId: z.string().trim().optional(),
});

export const reviewTaskSchema = z.object({
    action: z.enum(['approve', 'edit', 'reject']),
    editedFields: z.record(z.any()).optional(),
    reason: z.string().trim().optional(),
}).superRefine((value, ctx) => {
    if (value.action === 'edit' && (!value.editedFields || Object.keys(value.editedFields).length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'edit 액션에는 editedFields가 필요합니다.',
            path: ['editedFields'],
        });
    }

    if (value.action === 'reject' && !value.reason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'reject 액션에는 reason이 필요합니다.',
            path: ['reason'],
        });
    }
});
