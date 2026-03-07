import { AgentTaskStatus } from './types';

const allowedTransitions: Record<AgentTaskStatus, AgentTaskStatus[]> = {
    PENDING: ['RUNNING', 'FAILED'],
    RUNNING: ['NEEDS_REVIEW', 'FAILED', 'RETRYING'],
    RETRYING: ['RUNNING', 'FAILED', 'NEEDS_REVIEW'],
    NEEDS_REVIEW: ['DONE', 'FAILED', 'RETRYING'],
    DONE: [],
    FAILED: ['RETRYING'],
};

export function assertTaskTransition(current: AgentTaskStatus, next: AgentTaskStatus): void {
    if (current === next) {
        return;
    }

    const nextStatuses = allowedTransitions[current] ?? [];
    if (!nextStatuses.includes(next)) {
        throw new Error(`Invalid task status transition: ${current} -> ${next}`);
    }
}
