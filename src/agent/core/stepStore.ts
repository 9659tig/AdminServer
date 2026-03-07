import { AgentTaskStepRecord, PlanStep } from './types';

export interface AgentStepStore {
    initialize(taskId: string, steps: PlanStep[]): Promise<AgentTaskStepRecord[]>;
    getByTaskId(taskId: string): Promise<AgentTaskStepRecord[]>;
    update(taskId: string, stepId: string, patch: Partial<AgentTaskStepRecord>): Promise<void>;
    resetFromStep(taskId: string, fromStepId: string): Promise<void>;
    reset(): Promise<void>;
}

class InMemoryAgentStepStore implements AgentStepStore {
    private readonly steps = new Map<string, AgentTaskStepRecord[]>();

    async initialize(taskId: string, steps: PlanStep[]): Promise<AgentTaskStepRecord[]> {
        const now = new Date().toISOString();
        const records = steps.map((step, index) => ({
            taskId,
            stepId: step.stepId,
            order: index,
            tool: step.tool,
            input: step.input,
            status: 'PENDING' as const,
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
        }));

        this.steps.set(taskId, records);
        return records;
    }

    async getByTaskId(taskId: string): Promise<AgentTaskStepRecord[]> {
        return [...(this.steps.get(taskId) ?? [])].sort((a, b) => a.order - b.order);
    }

    async update(taskId: string, stepId: string, patch: Partial<AgentTaskStepRecord>): Promise<void> {
        const current = this.steps.get(taskId);
        if (!current) {
            return;
        }

        this.steps.set(taskId, current.map((step) => {
            if (step.stepId !== stepId) {
                return step;
            }

            return {
                ...step,
                ...patch,
            };
        }));
    }

    async resetFromStep(taskId: string, fromStepId: string): Promise<void> {
        const current = this.steps.get(taskId);
        if (!current) {
            return;
        }

        const startIndex = current.findIndex((step) => step.stepId === fromStepId);
        if (startIndex < 0) {
            return;
        }

        const now = new Date().toISOString();
        this.steps.set(taskId, current.map((step, index) => {
            if (index < startIndex) {
                return step;
            }

            return {
                ...step,
                status: 'PENDING',
                output: undefined,
                error: undefined,
                retryCount: step.retryCount + 1,
                updatedAt: now,
                startedAt: undefined,
                finishedAt: undefined,
            };
        }));
    }

    async reset(): Promise<void> {
        this.steps.clear();
    }
}

export function createInMemoryAgentStepStore(): AgentStepStore {
    return new InMemoryAgentStepStore();
}

export const agentStepStore = createInMemoryAgentStepStore();
