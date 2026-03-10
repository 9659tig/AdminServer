import { generateHmac } from '../../utils/generateHmac';
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

export class ShoppingSearchTool {
    constructor(private readonly deps: ShoppingSearchDeps = {}) {}

    async search(query: string, limit = 5): Promise<ShoppingSearchResult[]> {
        if (!query.trim()) {
            return [];
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
