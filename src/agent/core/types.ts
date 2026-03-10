export type AgentTaskType = 'AUTO_PRODUCT_FROM_VIDEO' | 'AUTO_PRODUCT_FROM_CLIP';

export type AgentTaskStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'RETRYING'
    | 'NEEDS_REVIEW'
    | 'DONE'
    | 'FAILED';

export type AgentStepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface ClipTaskContext {
    clipId?: string;
    clipLink?: string;
    videoId?: string;
    imageUrls?: string[];
    localAudioPath?: string;
    startSec?: number;
    endSec?: number;
    channelName?: string;
    videoTitle?: string;
    spokenText?: string;
}

export interface AgentTaskInput {
    taskType: AgentTaskType;
    videoUrl?: string;
    localVideoPath?: string;
    channelCategory?: string;
    clipContext?: ClipTaskContext;
    legacyCandidates?: string[];
}

export interface PlanStep {
    stepId: string;
    tool: string;
    input: Record<string, unknown>;
}

export interface Plan {
    version: string;
    steps: PlanStep[];
}

export interface AgentTaskRecord {
    taskId: string;
    type: AgentTaskType;
    status: AgentTaskStatus;
    input: AgentTaskInput;
    plan: Plan;
    result?: unknown;
    review?: unknown;
    error?: string;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    finishedAt?: string;
}

export interface AgentTaskStepRecord {
    taskId: string;
    stepId: string;
    order: number;
    tool: string;
    input: Record<string, unknown>;
    status: AgentStepStatus;
    output?: unknown;
    error?: string;
    retryCount: number;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    finishedAt?: string;
}

export interface AgentTaskProgress {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    runningSteps: number;
    pendingSteps: number;
    completionRatio: number;
}

export interface TaskFeedbackRecord extends ReviewPayload {
    taskId: string;
    createdAt: string;
}

export interface AgentTaskDetails {
    task: AgentTaskRecord;
    steps: AgentTaskStepRecord[];
    progress: AgentTaskProgress;
    feedback: TaskFeedbackRecord[];
}

export interface ReviewPayload {
    action: 'approve' | 'edit' | 'reject';
    editedFields?: Record<string, unknown>;
    reason?: string;
}
