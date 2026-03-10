import { createHash } from 'crypto';

export type CanaryStrategy = 'agent' | 'legacy';

export interface CanaryConfig {
    rolloutPercentage: number;
    forceStrategy?: CanaryStrategy;
    updatedAt: string;
}

export interface CanaryDecision {
    strategy: CanaryStrategy;
    bucket: number;
    rolloutPercentage: number;
    forceStrategy?: CanaryStrategy;
}

export interface CanaryConfigStore {
    get(): Promise<CanaryConfig>;
    update(patch: Partial<CanaryConfig>): Promise<CanaryConfig>;
    reset(): Promise<void>;
}

class InMemoryCanaryConfigStore implements CanaryConfigStore {
    private config: CanaryConfig = {
        rolloutPercentage: 0,
        updatedAt: new Date().toISOString(),
    };

    async get(): Promise<CanaryConfig> {
        return { ...this.config };
    }

    async update(patch: Partial<CanaryConfig>): Promise<CanaryConfig> {
        this.config = {
            ...this.config,
            ...patch,
            rolloutPercentage: Math.max(0, Math.min(100, Math.round(patch.rolloutPercentage ?? this.config.rolloutPercentage))),
            updatedAt: new Date().toISOString(),
        };
        return { ...this.config };
    }

    async reset(): Promise<void> {
        this.config = {
            rolloutPercentage: 0,
            updatedAt: new Date().toISOString(),
        };
    }
}

function bucketForKey(routingKey: string): number {
    const hash = createHash('sha256').update(routingKey).digest('hex');
    return Number.parseInt(hash.slice(0, 8), 16) % 100;
}

export class CanaryService {
    constructor(private readonly store: CanaryConfigStore = new InMemoryCanaryConfigStore()) {}

    async decide(routingKey: string): Promise<CanaryDecision> {
        const config = await this.store.get();
        const bucket = bucketForKey(routingKey);

        if (config.forceStrategy) {
            return {
                strategy: config.forceStrategy,
                bucket,
                rolloutPercentage: config.rolloutPercentage,
                forceStrategy: config.forceStrategy,
            };
        }

        return {
            strategy: bucket < config.rolloutPercentage ? 'agent' : 'legacy',
            bucket,
            rolloutPercentage: config.rolloutPercentage,
        };
    }

    async getConfig(): Promise<CanaryConfig> {
        return this.store.get();
    }

    async updateConfig(patch: Partial<CanaryConfig>): Promise<CanaryConfig> {
        return this.store.update(patch);
    }

    async reset(): Promise<void> {
        await this.store.reset();
    }
}

export function createInMemoryCanaryConfigStore(): CanaryConfigStore {
    return new InMemoryCanaryConfigStore();
}

export const canaryService = new CanaryService();
