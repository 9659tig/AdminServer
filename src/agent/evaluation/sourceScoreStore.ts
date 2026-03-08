import { ProductEvidence } from '../workflows/productTypes';
import { SourceScoreSnapshot } from './types';

export interface SourceScoreStore {
    applyOutcome(sourceTypes: ProductEvidence['sourceType'][], score: number): Promise<void>;
    list(): Promise<SourceScoreSnapshot[]>;
    reset(): Promise<void>;
}

type MutableSourceScore = Omit<SourceScoreSnapshot, 'averageScore'>;

class InMemorySourceScoreStore implements SourceScoreStore {
    private readonly scores = new Map<ProductEvidence['sourceType'], MutableSourceScore>();

    async applyOutcome(sourceTypes: ProductEvidence['sourceType'][], score: number): Promise<void> {
        const now = new Date().toISOString();

        sourceTypes.forEach((sourceType) => {
            const current = this.scores.get(sourceType) ?? {
                sourceType,
                scoreSum: 0,
                totalCount: 0,
                updatedAt: now,
            };

            current.scoreSum += score;
            current.totalCount += 1;
            current.updatedAt = now;
            this.scores.set(sourceType, current);
        });
    }

    async list(): Promise<SourceScoreSnapshot[]> {
        return [...this.scores.values()].map((entry) => ({
            ...entry,
            averageScore: entry.totalCount === 0 ? 0 : Number((entry.scoreSum / entry.totalCount).toFixed(2)),
        })).sort((a, b) => a.sourceType.localeCompare(b.sourceType));
    }

    async reset(): Promise<void> {
        this.scores.clear();
    }
}

export function createInMemorySourceScoreStore(): SourceScoreStore {
    return new InMemorySourceScoreStore();
}

export const sourceScoreStore = createInMemorySourceScoreStore();
