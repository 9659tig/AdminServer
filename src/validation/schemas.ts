import { z } from 'zod';

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
    subscriberCount: z.coerce.number().min(0, 'subscriberCount값이 잘못되었습니다.'),
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
