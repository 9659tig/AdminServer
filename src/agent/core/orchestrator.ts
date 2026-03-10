import { randomUUID } from 'crypto';
import { logger } from '../../config/logger';
import { FeedbackStore, feedbackStore } from '../memory/feedbackStore';
import { RulePlanner } from '../planner/RulePlanner';
import { ToolRegistry } from '../tools/toolRegistry';
import { AgentStepStore, agentStepStore } from './stepStore';
import { assertTaskTransition } from './stateMachine';
import { AgentTaskStore, agentTaskStore } from './taskStore';
import { TemplateResolver } from './templateResolver';
import {
    AgentTaskDetails,
    AgentTaskInput,
    AgentTaskRecord,
    AgentTaskStatus,
    ReviewPayload,
} from './types';
import { BuildClipContextTool, BuildVideoContextTool, PrepareReviewPayloadTool } from '../tools/contextTools';
import { VisionProductTool } from '../tools/VisionProductTool';
import { TranscriptExtractTool } from '../tools/TranscriptExtractTool';
import { ShoppingSearchTool } from '../tools/ShoppingSearchTool';
import { ProductExtractionWorkflow } from '../workflows/ProductExtractionWorkflow';

export interface OrchestratorDependencies {
    taskStore: AgentTaskStore;
    stepStore: AgentStepStore;
    planner: RulePlanner;
    toolRegistry: ToolRegistry;
    feedbackStore: FeedbackStore;
}

function createDefaultToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    const visionTool = new VisionProductTool();
    const transcriptTool = new TranscriptExtractTool();
    const shoppingTool = new ShoppingSearchTool();
    const productExtractionWorkflow = new ProductExtractionWorkflow({
        visionTool,
        transcriptTool,
        shoppingTool,
    });

    registry.register('build_video_context', new BuildVideoContextTool());
    registry.register('build_clip_context', new BuildClipContextTool());
    registry.register('vision_product', visionTool);
    registry.register('extract_transcript', transcriptTool);
    registry.register('shopping_search', shoppingTool);
    registry.register('product_extraction_workflow', productExtractionWorkflow);
    registry.register('prepare_review_payload', new PrepareReviewPayloadTool());
    return registry;
}

const defaultDependencies: OrchestratorDependencies = {
    taskStore: agentTaskStore,
    stepStore: agentStepStore,
    planner: new RulePlanner(),
    toolRegistry: createDefaultToolRegistry(),
    feedbackStore,
};

export class AgentOrchestrator {
    constructor(private readonly deps: OrchestratorDependencies = defaultDependencies) {}

    async startTask(input: AgentTaskInput): Promise<string> {
        const taskId = randomUUID();
        const plan = this.deps.planner.createPlan(input);
        const now = new Date().toISOString();

        await this.deps.taskStore.create({
            taskId,
            type: input.taskType,
            status: 'PENDING',
            input,
            plan,
            createdAt: now,
            updatedAt: now,
        });
        await this.deps.stepStore.initialize(taskId, plan.steps);

        logger.info({
            event: 'agent_task_created',
            taskId,
            taskType: input.taskType,
        }, 'agent_task_created');

        setImmediate(() => {
            this.executeTask(taskId).catch((err) => {
                logger.error({
                    event: 'agent_task_execute_crashed',
                    taskId,
                    err,
                }, 'agent_task_execute_crashed');
            });
        });

        return taskId;
    }

    async getTaskDetails(taskId: string): Promise<AgentTaskDetails | undefined> {
        const task = await this.deps.taskStore.get(taskId);
        if (!task) {
            return undefined;
        }

        const steps = await this.deps.stepStore.getByTaskId(taskId);
        const feedback = await this.deps.feedbackStore.getByTaskId(taskId);
        return {
            task,
            steps,
            feedback,
            progress: this.buildProgress(steps),
        };
    }

    async retryTask(taskId: string, fromStepId?: string): Promise<void> {
        const task = await this.requireTask(taskId);
        const steps = await this.deps.stepStore.getByTaskId(taskId);
        const targetStepId = fromStepId ?? steps.find((step) => step.status !== 'DONE')?.stepId ?? steps[0]?.stepId;

        if (!targetStepId) {
            throw new Error('Retry target step not found');
        }
        if (!steps.some((step) => step.stepId === targetStepId)) {
            throw new Error(`Retry step not found: ${targetStepId}`);
        }

        await this.transitionTask(task, 'RETRYING', {
            error: undefined,
            result: undefined,
            review: undefined,
            updatedAt: new Date().toISOString(),
            finishedAt: undefined,
        });
        await this.deps.stepStore.resetFromStep(taskId, targetStepId);

        logger.info({
            event: 'agent_task_retry_requested',
            taskId,
            fromStepId: targetStepId,
        }, 'agent_task_retry_requested');

        setImmediate(() => {
            this.executeTask(taskId, targetStepId).catch((err) => {
                logger.error({
                    event: 'agent_task_retry_crashed',
                    taskId,
                    err,
                }, 'agent_task_retry_crashed');
            });
        });
    }

    async reviewTask(taskId: string, payload: ReviewPayload): Promise<AgentTaskDetails> {
        const task = await this.requireTask(taskId);
        await this.deps.feedbackStore.record(taskId, payload);

        const nextStatus: AgentTaskStatus = payload.action === 'reject' ? 'FAILED' : 'DONE';
        await this.transitionTask(task, nextStatus, {
            review: payload,
            updatedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        });

        logger.info({
            event: 'agent_task_review_applied',
            taskId,
            action: payload.action,
        }, 'agent_task_review_applied');

        const updated = await this.getTaskDetails(taskId);
        if (!updated) {
            throw new Error('Task not found after review');
        }
        return updated;
    }

    async reset(): Promise<void> {
        await this.deps.taskStore.reset();
        await this.deps.stepStore.reset();
        await this.deps.feedbackStore.reset();
    }

    private async executeTask(taskId: string, fromStepId?: string): Promise<void> {
        const task = await this.requireTask(taskId);
        const steps = await this.deps.stepStore.getByTaskId(taskId);
        const startIndex = fromStepId ? steps.findIndex((step) => step.stepId === fromStepId) : 0;
        const resolver = new TemplateResolver(task.input as unknown as Record<string, unknown>);

        for (const step of steps) {
            if (step.status === 'DONE' && step.output !== undefined) {
                resolver.recordOutput(step.stepId, step.output);
            }
        }

        await this.transitionTask(task, 'RUNNING', {
            startedAt: task.startedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            finishedAt: undefined,
            error: undefined,
        });

        for (let index = Math.max(startIndex, 0); index < steps.length; index++) {
            const step = steps[index];
            const startedAt = new Date().toISOString();

            logger.info({
                event: 'agent_step_started',
                taskId,
                stepId: step.stepId,
                tool: step.tool,
            }, 'agent_step_started');

            await this.deps.stepStore.update(taskId, step.stepId, {
                status: 'RUNNING',
                startedAt,
                updatedAt: startedAt,
                error: undefined,
            });

            try {
                const resolvedInput = resolver.resolve(step.input);
                const tool = this.deps.toolRegistry.get(step.tool);
                const output = await tool.run(resolvedInput);
                resolver.recordOutput(step.stepId, output);

                await this.deps.stepStore.update(taskId, step.stepId, {
                    status: 'DONE',
                    output,
                    updatedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                });

                logger.info({
                    event: 'agent_step_done',
                    taskId,
                    stepId: step.stepId,
                }, 'agent_step_done');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                await this.deps.stepStore.update(taskId, step.stepId, {
                    status: 'FAILED',
                    error: errorMessage,
                    updatedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                });
                await this.transitionTask(task, 'FAILED', {
                    error: errorMessage,
                    updatedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                });
                logger.error({
                    event: 'agent_step_failed',
                    taskId,
                    stepId: step.stepId,
                    err,
                }, 'agent_step_failed');
                return;
            }
        }

        const latestSteps = await this.deps.stepStore.getByTaskId(taskId);
        const finalOutput = latestSteps[latestSteps.length - 1]?.output;
        await this.transitionTask(task, 'NEEDS_REVIEW', {
            result: finalOutput,
            updatedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        });
    }

    private async transitionTask(task: AgentTaskRecord, next: AgentTaskStatus, patch: Partial<AgentTaskRecord>): Promise<void> {
        const current = await this.requireTask(task.taskId);
        assertTaskTransition(current.status, next);
        await this.deps.taskStore.update(task.taskId, {
            ...patch,
            status: next,
        });
    }

    private buildProgress(steps: AgentTaskDetails['steps']): AgentTaskDetails['progress'] {
        const totalSteps = steps.length;
        const completedSteps = steps.filter((step) => step.status === 'DONE').length;
        const failedSteps = steps.filter((step) => step.status === 'FAILED').length;
        const runningSteps = steps.filter((step) => step.status === 'RUNNING').length;
        const pendingSteps = steps.filter((step) => step.status === 'PENDING').length;

        return {
            totalSteps,
            completedSteps,
            failedSteps,
            runningSteps,
            pendingSteps,
            completionRatio: totalSteps === 0 ? 0 : Number((completedSteps / totalSteps).toFixed(2)),
        };
    }

    private async requireTask(taskId: string): Promise<AgentTaskRecord> {
        const task = await this.deps.taskStore.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }
        return task;
    }
}

export const agentOrchestrator = new AgentOrchestrator();
