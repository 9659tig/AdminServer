import { Request, Response } from 'express';
import { agentOrchestrator, AgentOrchestrator } from '../core/orchestrator';
import { AgentTaskInput, ReviewPayload } from '../core/types';

interface AgentControllerDeps {
    orchestrator: AgentOrchestrator;
}

const defaultDeps: AgentControllerDeps = {
    orchestrator: agentOrchestrator,
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
    };
}

export const agentController = createAgentController();
