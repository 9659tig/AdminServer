import { getEnv } from '../config/env';

type SyncEntity = 'product' | 'influencer';
type SyncOperation = 'upsert' | 'delete';

interface SyncRequest {
    entity: SyncEntity;
    operation: SyncOperation;
    item: Record<string, unknown>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendSync(request: SyncRequest, attempt: number = 1): Promise<void> {
    const env = getEnv();
    const baseUrl = env.USER_SERVER_URL;
    const token = env.INTERNAL_SYNC_TOKEN;

    if (!baseUrl || !token) {
        return; // sync 미설정 환경에서는 조용히 스킵
    }

    try {
        const response = await fetch(`${baseUrl}/internal/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Token': token,
            },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            throw new Error(`sync failed: HTTP ${response.status}`);
        }
    } catch (err) {
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            return sendSync(request, attempt + 1);
        }
        // 최대 재시도 초과 시 로그만 남기고 메인 흐름 방해하지 않음
        console.error(`[UserServerSync] ${request.entity} ${request.operation} 동기화 실패 (${MAX_RETRIES}회 시도):`, err);
    }
}

export function syncProduct(item: Record<string, unknown>): void {
    sendSync({ entity: 'product', operation: 'upsert', item }).catch(() => {});
}

export function syncInfluencer(item: Record<string, unknown>): void {
    sendSync({ entity: 'influencer', operation: 'upsert', item }).catch(() => {});
}
