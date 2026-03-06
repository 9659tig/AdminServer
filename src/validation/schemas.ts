import { z } from 'zod';

const numericValue = z.coerce.number();
const optionalString = z.string().trim().optional().default('');
const booleanValue = z.union([
    z.boolean(),
    z.string().trim().transform((value, ctx) => {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'categoryUpdate값이 잘못되었습니다.',
        });
        return z.NEVER;
    }),
]);

export const channelIdParamSchema = z.object({
    channelId: z.string().trim().min(1, 'channelId값이 없습니다.'),
});

export const videoIdParamSchema = z.object({
    videoId: z.string().trim().min(1, 'videoId값이 없습니다.'),
});

export const videoLinkQuerySchema = z.object({
    videoUrl: z.string().trim().url('videoUrl은 올바른 URL이어야 합니다.'),
});

export const productNameBodySchema = z.object({
    candidates: z.array(z.string().trim().min(1)).min(1, 'candidates는 최소 1개 이상이어야 합니다.'),
});

export const influencerBodySchema = z.object({
    channel_ID: z.string().trim().min(1, 'channel Id값이 없습니다.'),
    channel_link: z.string().trim().url('channel Link값이 잘못되었습니다.'),
    channel_description: optionalString,
    pfp_url: z.string().trim().url('pfp_url값이 잘못되었습니다.'),
    banner_url: z.string().trim().url('banner_url값이 잘못되었습니다.'),
    channel_name: z.string().trim().min(1, 'channel Name값이 없습니다.'),
    email: z.string().trim().email('email값이 잘못되었습니다.').or(z.literal('')).optional().default(''),
    links: z.array(z.object({
        type: z.string().trim().min(1, 'link type값이 없습니다.'),
        link: z.string().trim().url('link값이 잘못되었습니다.'),
    })).default([]),
    subscriberCount: numericValue.min(0, 'subscriberCount값이 잘못되었습니다.'),
});

export const clipTaskBodySchema = z.object({
    startTime: numericValue.min(0, 'startTime값이 잘못되었습니다.'),
    endTime: numericValue.min(0, 'endTime값이 잘못되었습니다.'),
    videoSrc: z.string().trim().min(1, 'videoSrc값이 없습니다.'),
    channelId: z.string().trim().min(1, 'channelId값이 없습니다.'),
    videoUrl: z.string().trim().url('videoUrl값이 잘못되었습니다.'),
    name: optionalString,
}).refine((data) => data.endTime > data.startTime, {
    message: 'endTime은 startTime보다 커야 합니다.',
    path: ['endTime'],
});

export const productImgsQuerySchema = z.object({
    channelID: z.string().trim().min(1, 'channel Id값이 없습니다.'),
    videoID: z.string().trim().min(1, 'video Id값이 없습니다.'),
    createDate: z.string().trim().min(1, 'create Date값이 없습니다.'),
});

export const productSearchQuerySchema = z.object({
    link: z.string().trim().url('link값이 잘못되었습니다.'),
});

export const coupangHmacBodySchema = z.object({
    method: z.string().trim().min(1, 'method값이 정의되지 않았습니다.'),
    url: z.string().trim().min(1, 'url값이 정의되지 않았습니다.'),
});

export const addProductBodySchema = z.object({
    clipLink: z.string().trim().url('clipLink값이 잘못되었습니다.'),
    productLink: z.string().trim().url('productLink값이 잘못되었습니다.'),
    productDeepLink: z.string().trim().url('productDeepLink값이 잘못되었습니다.'),
    productImages: z.string().trim().min(1, 'productImages값이 없습니다.'),
    productName: z.string().trim().min(1, 'productName값이 없습니다.'),
    productBrand: z.string().trim().min(1, 'productBrand값이 없습니다.'),
    productPrice: z.coerce.number().nonnegative('productPrice값이 잘못되었습니다.'),
    category: z.string().trim().min(1, 'category값이 없습니다.'),
    videoId: z.string().trim().min(1, 'videoId값이 없습니다.'),
    categoryUpdate: booleanValue,
    channelId: z.string().trim().min(1, 'channelId값이 없습니다.'),
    meta: optionalString,
});

export const checkProductExistParamsSchema = z.object({
    channelId: z.string().trim().min(1, 'channelId값이 없습니다.'),
});

export const checkProductExistQuerySchema = z.object({
    productLink: z.string().trim().url('productLink값이 잘못되었습니다.'),
});
