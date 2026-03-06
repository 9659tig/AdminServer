export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface TaskRecord<TInput = unknown, TResult = unknown> {
    taskId: string;
    type: string;
    status: TaskStatus;
    input: TInput;
    result?: TResult;
    error?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
}

export interface TaskStore {
    create<TInput>(record: TaskRecord<TInput>): Promise<void>;
    update(taskId: string, patch: Partial<TaskRecord>): Promise<void>;
    get(taskId: string): Promise<TaskRecord | undefined>;
    list(): Promise<TaskRecord[]>;
    reset(): Promise<void>;
}

class InMemoryTaskStore implements TaskStore {
    private readonly tasks = new Map<string, TaskRecord>();

    async create<TInput>(record: TaskRecord<TInput>): Promise<void> {
        this.tasks.set(record.taskId, record as TaskRecord);
    }

    async update(taskId: string, patch: Partial<TaskRecord>): Promise<void> {
        const current = this.tasks.get(taskId);
        if (!current) {
            return;
        }
        this.tasks.set(taskId, {
            ...current,
            ...patch,
        });
    }

    async get(taskId: string): Promise<TaskRecord | undefined> {
        return this.tasks.get(taskId);
    }

    async list(): Promise<TaskRecord[]> {
        return Array.from(this.tasks.values());
    }

    async reset(): Promise<void> {
        this.tasks.clear();
    }
}

export function createInMemoryTaskStore(): TaskStore {
    return new InMemoryTaskStore();
}

export const taskStore = createInMemoryTaskStore();
