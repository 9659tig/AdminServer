import { DualRunRecord } from './types';

export interface EvaluationStore {
    create(record: DualRunRecord): Promise<void>;
    get(evaluationId: string): Promise<DualRunRecord | undefined>;
    list(): Promise<DualRunRecord[]>;
    reset(): Promise<void>;
}

class InMemoryEvaluationStore implements EvaluationStore {
    private readonly records = new Map<string, DualRunRecord>();

    async create(record: DualRunRecord): Promise<void> {
        this.records.set(record.evaluationId, record);
    }

    async get(evaluationId: string): Promise<DualRunRecord | undefined> {
        return this.records.get(evaluationId);
    }

    async list(): Promise<DualRunRecord[]> {
        return [...this.records.values()];
    }

    async reset(): Promise<void> {
        this.records.clear();
    }
}

export function createInMemoryEvaluationStore(): EvaluationStore {
    return new InMemoryEvaluationStore();
}

export const evaluationStore = createInMemoryEvaluationStore();
