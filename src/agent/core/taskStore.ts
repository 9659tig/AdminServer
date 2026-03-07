import { AgentTaskRecord } from './types';

export interface AgentTaskStore {
    create(task: AgentTaskRecord): Promise<void>;
    get(taskId: string): Promise<AgentTaskRecord | undefined>;
    update(taskId: string, patch: Partial<AgentTaskRecord>): Promise<void>;
    reset(): Promise<void>;
}

class InMemoryAgentTaskStore implements AgentTaskStore {
    private readonly tasks = new Map<string, AgentTaskRecord>();

    async create(task: AgentTaskRecord): Promise<void> {
        this.tasks.set(task.taskId, task);
    }

    async get(taskId: string): Promise<AgentTaskRecord | undefined> {
        return this.tasks.get(taskId);
    }

    async update(taskId: string, patch: Partial<AgentTaskRecord>): Promise<void> {
        const current = this.tasks.get(taskId);
        if (!current) {
            return;
        }

        this.tasks.set(taskId, {
            ...current,
            ...patch,
        });
    }

    async reset(): Promise<void> {
        this.tasks.clear();
    }
}

export function createInMemoryAgentTaskStore(): AgentTaskStore {
    return new InMemoryAgentTaskStore();
}

export const agentTaskStore = createInMemoryAgentTaskStore();
