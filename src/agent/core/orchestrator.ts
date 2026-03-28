import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../../config/logger';
import { FeedbackStore, feedbackStore } from '../memory/feedbackStore';
import { RulePlanner } from '../planner/RulePlanner';
import { ToolRegistry } from '../tools/toolRegistry';
import { goldSetStore, GoldSetStore } from '../evaluation/goldSetStore';
import { sourceScoreStore, SourceScoreStore } from '../evaluation/sourceScoreStore';
import { buildGoldSetExample, buildTaskEvidenceView, getEvidenceSources, getLearningScoreForReview } from '../evaluation/taskArtifacts';
import { AgentStepStore, agentStepStore } from './stepStore';
import { assertTaskTransition } from './stateMachine';
import { AgentTaskStore, agentTaskStore } from './taskStore';
import { TemplateResolver } from './templateResolver';
import {
    AgentTaskDetails,
    AgentTaskInput,
    AgentTaskRecord,
    AgentTaskStepRecord,
    AgentTaskStatus,
    ReviewPayload,
} from './types';
import { BuildClipContextTool, BuildVideoContextTool, PrepareReviewPayloadTool } from '../tools/contextTools';
import { VisionProductTool } from '../tools/VisionProductTool';
import { TranscriptExtractTool } from '../tools/TranscriptExtractTool';
import { ShoppingSearchTool } from '../tools/ShoppingSearchTool';
import { ProductExtractionWorkflow } from '../workflows/ProductExtractionWorkflow';
import { VideoFrameExtractorTool } from '../tools/VideoFrameExtractorTool';

export interface OrchestratorDependencies {
    taskStore: AgentTaskStore;
    stepStore: AgentStepStore;
    planner: RulePlanner;
    toolRegistry: ToolRegistry;
    feedbackStore: FeedbackStore;
    goldSetStore: GoldSetStore;
    sourceScoreStore: SourceScoreStore;
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
    registry.register('video_frame_extractor', new VideoFrameExtractorTool());
    return registry;
}

const defaultDependencies: OrchestratorDependencies = {
    taskStore: agentTaskStore,
    stepStore: agentStepStore,
    planner: new RulePlanner(),
    toolRegistry: createDefaultToolRegistry(),
    feedbackStore,
    goldSetStore,
    sourceScoreStore,
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

        logger.info({
            event: 'pipeline_start',
            taskId,
            taskType: input.taskType,
            planVersion: plan.version,
            totalSteps: plan.steps.length,
            stepSequence: plan.steps.map((s) => s.stepId),
            category: input.channelCategory ?? 'none',
            hasVideoFile: Boolean(input.localVideoPath),
        }, `🚀 [Pipeline] Task 생성 완료 — ${input.taskType} | ${plan.steps.length}단계 플랜(${plan.version}) | 카테고리: ${input.channelCategory ?? 'none'}`);

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

        // 리뷰 완료 후 원본 영상 파일 삭제
        if (task.input.localVideoPath) {
            try { fs.rmSync(task.input.localVideoPath, { force: true }); } catch { /* ignore */ }
        }

        logger.info({
            event: 'agent_task_review_applied',
            taskId,
            action: payload.action,
        }, 'agent_task_review_applied');

        logger.info({
            event: 'pipeline_review',
            taskId,
            action: payload.action,
            nextStatus: nextStatus,
            hasEditedFields: Boolean(payload.editedFields),
            hasReason: Boolean(payload.reason),
        }, `📋 [Review] ${payload.action.toUpperCase()} → 상태: ${nextStatus} | 코멘트: ${payload.reason ? '있음' : '없음'}`);

        const updated = await this.getTaskDetails(taskId);
        if (!updated) {
            throw new Error('Task not found after review');
        }

        const goldSetExample = buildGoldSetExample({
            details: updated,
            payload,
        });
        if (goldSetExample) {
            await this.deps.goldSetStore.add(goldSetExample);
            logger.info({
                event: 'pipeline_goldset_added',
                taskId,
                category: goldSetExample.category,
                expectedProduct: goldSetExample.expectedProduct,
                candidateCount: goldSetExample.candidateNames.length,
            }, `📚 [Feedback] GoldSet에 추가 — 카테고리: ${goldSetExample.category} | 정답: ${goldSetExample.expectedProduct} | 후보 ${goldSetExample.candidateNames.length}개`);
        }

        const evidenceSources = getEvidenceSources(updated);
        const learningScore = getLearningScoreForReview(payload.action);
        if (evidenceSources.length) {
            await this.deps.sourceScoreStore.applyOutcome(evidenceSources, learningScore);
            logger.info({
                event: 'pipeline_sourcescore_updated',
                taskId,
                sources: evidenceSources,
                score: learningScore,
                action: payload.action,
            }, `📊 [Feedback] SourceScore 업데이트 — ${evidenceSources.join(', ')} | 점수: ${learningScore} (${payload.action})`);
        }

        return updated;
    }

    async getTaskEvidence(taskId: string) {
        const details = await this.getTaskDetails(taskId);
        if (!details) {
            return undefined;
        }

        return buildTaskEvidenceView(details);
    }

    async reset(): Promise<void> {
        await this.deps.taskStore.reset();
        await this.deps.stepStore.reset();
        await this.deps.feedbackStore.reset();
        await this.deps.goldSetStore.reset();
        await this.deps.sourceScoreStore.reset();
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

            logger.info({
                event: 'pipeline_step_start',
                taskId,
                stepId: step.stepId,
                stepIndex: index + 1,
                totalSteps: steps.length,
                tool: step.tool,
            }, `⏩ [Step ${index + 1}/${steps.length}] "${step.stepId}" 시작 — Tool: ${step.tool}`);

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

                const elapsed = Date.now() - new Date(startedAt).getTime();
                logger.info({
                    event: 'pipeline_step_done',
                    taskId,
                    stepId: step.stepId,
                    stepIndex: index + 1,
                    totalSteps: steps.length,
                    elapsedMs: elapsed,
                }, `✅ [Step ${index + 1}/${steps.length}] "${step.stepId}" 완료 — ${elapsed}ms 소요`);
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

                logger.error({
                    event: 'pipeline_step_failed',
                    taskId,
                    stepId: step.stepId,
                    stepIndex: index + 1,
                    error: errorMessage,
                }, `❌ [Step ${index + 1}/${steps.length}] "${step.stepId}" 실패 — ${errorMessage}`);

                // Cleanup on failure: tmpDirs only, preserve video for retry
                const currentSteps = await this.deps.stepStore.getByTaskId(taskId);
                this.cleanupTaskFiles(task.input, currentSteps, false);
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

        const totalElapsed = Date.now() - new Date(task.startedAt ?? task.createdAt).getTime();
        const extraction = (finalOutput as Record<string, unknown> | undefined)?.extraction as Record<string, unknown> | undefined;
        logger.info({
            event: 'pipeline_complete',
            taskId,
            totalElapsedMs: totalElapsed,
            finalStatus: extraction?.status,
            confidence: extraction?.confidence,
            recommendation: extraction?.recommendation,
            selectedProduct: (extraction?.selectedProduct as Record<string, unknown> | undefined)?.name,
        }, `🏁 [Pipeline] 완료 — ${totalElapsed}ms 소요 | confidence: ${extraction?.confidence} | 상태: ${extraction?.status} | 추천: ${extraction?.recommendation}`);
        // 영상 파일은 리뷰 완료(reviewTask) 시점에 삭제; tmpDirs만 정리
        this.cleanupTaskFiles(task.input, latestSteps, false);
    }

    private cleanupTaskFiles(
        input: AgentTaskInput,
        steps: AgentTaskStepRecord[],
        cleanupVideoFile: boolean,
    ): void {
        // 프레임 tmpdir 정리
        for (const step of steps) {
            const output = step.output as Record<string, unknown> | undefined;
            const tmpDirId = output?.tmpDirId;
            if (typeof tmpDirId === 'string') {
                const tmpDir = path.join(os.tmpdir(), `agent-frames-${tmpDirId}`);
                try {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                } catch {
                    // cleanup 실패는 무시
                }
            }
        }

        // 업로드된 원본 영상 파일 정리
        if (cleanupVideoFile && input.localVideoPath) {
            try {
                fs.rmSync(input.localVideoPath, { force: true });
            } catch {
                // cleanup 실패는 무시
            }
        }
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
