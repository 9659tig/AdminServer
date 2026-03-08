import { Request, Response } from 'express';
import { agentOrchestrator, AgentOrchestrator } from '../core/orchestrator';
import { AgentTaskInput, ReviewPayload } from '../core/types';
import { DualRunService, dualRunService } from '../evaluation/dualRunService';
import { GoldSetStore, goldSetStore } from '../evaluation/goldSetStore';

interface AgentControllerDeps {
    orchestrator: AgentOrchestrator;
    dualRunService: DualRunService;
    goldSetStore: GoldSetStore;
}

const defaultDeps: AgentControllerDeps = {
    orchestrator: agentOrchestrator,
    dualRunService,
    goldSetStore,
};

function respondAgentError(req: Request, res: Response, err: unknown): Response {
    const message = err instanceof Error ? err.message : String(err);

    req.log.error({
        event: 'agent_request_failed',
        err,
        method: req.method,
        path: req.path,
    }, 'agent_request_failed');

    if (message.startsWith('Task not found:')) {
        return res.status(404).json({ error: 'Task not found', message });
    }

    if (message === 'Retry target step not found' || message.startsWith('Retry step not found:')) {
        return res.status(400).json({ error: 'Invalid retry request', message });
    }

    if (message.startsWith('Invalid task status transition:')) {
        return res.status(409).json({ error: 'Invalid task state', message });
    }

    return res.status(500).json({ error: 'Agent request failed', message });
}

export function createAgentController(deps: AgentControllerDeps = defaultDeps) {
    return {
        createTask: async (req: Request, res: Response) => {
            try {
                const input = req.validated.body as AgentTaskInput;
                const taskId = await deps.orchestrator.startTask(input);
                req.log.info({
                    event: 'agent_task_http_created',
                    taskId,
                    taskType: input.taskType,
                }, 'agent_task_http_created');
                return res.status(202).json({
                    taskId,
                    status: 'PENDING',
                });
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        getTask: async (req: Request, res: Response) => {
            try {
                const { taskId } = req.validated.params as { taskId: string };
                const details = await deps.orchestrator.getTaskDetails(taskId);

                if (!details) {
                    return res.status(404).json({ error: 'Task not found' });
                }

                return res.json(details);
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        getTaskEvidence: async (req: Request, res: Response) => {
            try {
                const { taskId } = req.validated.params as { taskId: string };
                const evidence = await deps.orchestrator.getTaskEvidence(taskId);

                if (!evidence) {
                    return res.status(404).json({ error: 'Task not found' });
                }

                return res.json(evidence);
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        retryTask: async (req: Request, res: Response) => {
            try {
                const { taskId } = req.validated.params as { taskId: string };
                const { fromStepId } = req.validated.body as { fromStepId?: string };
                await deps.orchestrator.retryTask(taskId, fromStepId);
                return res.json({ success: true });
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        reviewTask: async (req: Request, res: Response) => {
            try {
                const { taskId } = req.validated.params as { taskId: string };
                const payload = req.validated.body as ReviewPayload;
                const details = await deps.orchestrator.reviewTask(taskId, payload);
                return res.json({
                    success: true,
                    task: details.task,
                });
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        createDualRunEvaluation: async (req: Request, res: Response) => {
            try {
                const payload = req.validated.body as {
                    input: AgentTaskInput;
                    goldLabel?: string;
                    evaluationName?: string;
                    iterations?: number;
                };
                const record = await deps.dualRunService.run(payload);
                return res.status(201).json(record);
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        getEvaluation: async (req: Request, res: Response) => {
            try {
                const { evaluationId } = req.validated.params as { evaluationId: string };
                const record = await deps.dualRunService.get(evaluationId);

                if (!record) {
                    return res.status(404).json({ error: 'Evaluation not found' });
                }

                return res.json(record);
            } catch (err) {
                return respondAgentError(req, res, err);
            }
        },
        getEvaluationSummary: async (_req: Request, res: Response) => {
            try {
                const summary = await deps.dualRunService.getSummary();
                return res.json(summary);
            } catch (err) {
                return respondAgentError(_req, res, err);
            }
        },
        listGoldSetExamples: async (_req: Request, res: Response) => {
            try {
                const examples = await deps.goldSetStore.list();
                return res.json({
                    count: examples.length,
                    examples,
                });
            } catch (err) {
                return respondAgentError(_req, res, err);
            }
        },
    };
}

export const agentController = createAgentController();
