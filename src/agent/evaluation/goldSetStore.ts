import { GoldSetExample } from './types';

export interface GoldSetStore {
    add(example: GoldSetExample): Promise<void>;
    list(): Promise<GoldSetExample[]>;
    listByCategory(category: string): Promise<GoldSetExample[]>;
    size(): Promise<number>;
    reset(): Promise<void>;
}

class InMemoryGoldSetStore implements GoldSetStore {
    private readonly examples = new Map<string, GoldSetExample>();

    async add(example: GoldSetExample): Promise<void> {
        this.examples.set(example.exampleId, example);
    }

    async list(): Promise<GoldSetExample[]> {
        return [...this.examples.values()];
    }

    async listByCategory(category: string): Promise<GoldSetExample[]> {
        const normalized = category.trim().toLowerCase();
        return [...this.examples.values()].filter((example) => (example.category ?? '').trim().toLowerCase() === normalized);
    }

    async size(): Promise<number> {
        return this.examples.size;
    }

    async reset(): Promise<void> {
        this.examples.clear();
    }
}

export function createInMemoryGoldSetStore(): GoldSetStore {
    return new InMemoryGoldSetStore();
}

export const goldSetStore = createInMemoryGoldSetStore();
