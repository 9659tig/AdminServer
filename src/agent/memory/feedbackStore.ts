import { ReviewPayload, TaskFeedbackRecord } from '../core/types';

export interface FeedbackStore {
    record(taskId: string, payload: ReviewPayload): Promise<void>;
    getByTaskId(taskId: string): Promise<TaskFeedbackRecord[]>;
    reset(): Promise<void>;
}

class InMemoryFeedbackStore implements FeedbackStore {
    private readonly feedback = new Map<string, TaskFeedbackRecord[]>();

    async record(taskId: string, payload: ReviewPayload): Promise<void> {
        const current = this.feedback.get(taskId) ?? [];
        current.push({
            taskId,
            createdAt: new Date().toISOString(),
            ...payload,
        });
        this.feedback.set(taskId, current);
    }

    async getByTaskId(taskId: string): Promise<TaskFeedbackRecord[]> {
        return [...(this.feedback.get(taskId) ?? [])];
    }

    async reset(): Promise<void> {
        this.feedback.clear();
    }
}

export function createInMemoryFeedbackStore(): FeedbackStore {
    return new InMemoryFeedbackStore();
}

export const feedbackStore = createInMemoryFeedbackStore();
