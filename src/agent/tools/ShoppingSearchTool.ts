import { generateHmac } from '../../utils/generateHmac';
import { COUPANG_ACCESS } from '../../config/secret';
import { getEnv } from '../../config/env';
import { ShoppingSearchResult } from '../workflows/productTypes';

interface FetchResponseLike {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<FetchResponseLike>;

interface ShoppingSearchDeps {
    fetchImpl?: FetchLike;
    hmacGenerator?: typeof generateHmac;
    apiBaseUrl?: string;
}

function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

function getStringField(item: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = item[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

function normalizeCoupangItems(payload: unknown): ShoppingSearchResult[] {
    const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};

    const rawItems =
        Array.isArray(data.productData) ? data.productData :
        Array.isArray(data.products) ? data.products :
        Array.isArray(root.products) ? root.products :
        [];

    const normalizedItems = rawItems
        .map((entry, index) => {
            const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            const productName = getStringField(item, ['productName', 'title', 'name']);
            const productUrl = getStringField(item, ['productUrl', 'url', 'productLink']);

            if (!productName || !productUrl) {
                return undefined;
            }

            return {
                source: 'coupang' as const,
                productName,
                productUrl,
                deepLink: getStringField(item, ['productUrlMobile', 'deepLink', 'affiliateUrl']) || undefined,
                price: toNumber(item.salePrice ?? item.price),
                currency: 'KRW',
                reviewCount: toNumber(item.reviewCount ?? item.ratingCount) ?? 0,
                imageUrl: getStringField(item, ['productImage', 'imageUrl', 'thumbnail']) || undefined,
                rank: index + 1,
                metadata: {
                    productId: getStringField(item, ['productId']),
                    vendorItemId: getStringField(item, ['vendorItemId']),
                },
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== undefined);

    return normalizedItems.sort((a, b) => b.reviewCount - a.reviewCount);
}

async function searchViaNaver(query: string, limit: number): Promise<ShoppingSearchResult[]> {
    const env = getEnv();
    if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
        return [];
    }

    // 검색어에 쉼표가 있으면 첫 번째 키워드만 사용
    const cleanQuery = query.split(',')[0].trim();

    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(cleanQuery)}&display=${limit}&sort=sim`;
    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
        },
    });

    if (!response.ok) {
        throw new Error(`Naver shopping search failed: ${response.status}`);
    }

    const data = await response.json() as { items?: Array<Record<string, unknown>> };
    const items = data.items ?? [];

    return items.slice(0, limit).map((item, index) => ({
        source: 'naver' as const,
        productName: String(item.title ?? '').replace(/<[^>]+>/g, ''),
        productUrl: String(item.link ?? ''),
        price: item.lprice ? Number(item.lprice) : undefined,
        currency: 'KRW',
        reviewCount: 0,
        imageUrl: item.image ? String(item.image) : undefined,
        rank: index + 1,
        metadata: {
            mallName: String(item.mallName ?? ''),
            productId: String(item.productId ?? ''),
        },
    }));
}

export class ShoppingSearchTool {
    constructor(private readonly deps: ShoppingSearchDeps = {}) {}

    async search(query: string, limit = 5): Promise<ShoppingSearchResult[]> {
        if (!query.trim()) {
            return [];
        }

        // 쿠팡 어필리에이트 API 키가 없으면 네이버 쇼핑 API로 대체
        if (!COUPANG_ACCESS.KEY || !COUPANG_ACCESS.SECRET_KEY) {
            return searchViaNaver(query, limit);
        }

        const fetchImpl = this.deps.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
        if (!fetchImpl) {
            throw new Error('Global fetch is not available');
        }

        const path = `/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=${encodeURIComponent(query)}&limit=${limit}`;
        const authorization = await (this.deps.hmacGenerator ?? generateHmac)('GET', path);
        const response = await fetchImpl(`${this.deps.apiBaseUrl ?? 'https://api-gateway.coupang.com'}${path}`, {
            method: 'GET',
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Coupang search failed with status ${response.status}`);
        }

        return normalizeCoupangItems(await response.json()).slice(0, limit);
    }

    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const query = typeof input.query === 'string' ? input.query : '';
        const limit = typeof input.limit === 'number' ? input.limit : undefined;
        return {
            shoppingResults: await this.search(query, limit),
        };
    }
}
