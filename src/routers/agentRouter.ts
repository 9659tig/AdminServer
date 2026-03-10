import express, { Router } from 'express';
import { agentController } from '../agent/http/agentController';
import { validateBody, validateParams } from '../middleware/validate';
import {
    createAgentTaskSchema,
    dualRunEvaluationSchema,
    evaluationIdParamSchema,
    reviewTaskSchema,
    retryTaskSchema,
    taskIdParamSchema,
} from '../validation/agentSchemas';

const router: Router = express.Router();

router.post('/tasks', validateBody(createAgentTaskSchema), agentController.createTask);
router.get('/tasks/:taskId', validateParams(taskIdParamSchema), agentController.getTask);
router.get('/tasks/:taskId/evidence', validateParams(taskIdParamSchema), agentController.getTaskEvidence);
router.post('/tasks/:taskId/review', validateParams(taskIdParamSchema), validateBody(reviewTaskSchema), agentController.reviewTask);
router.post('/tasks/:taskId/retry', validateParams(taskIdParamSchema), validateBody(retryTaskSchema), agentController.retryTask);
router.post('/evaluations/dual-run', validateBody(dualRunEvaluationSchema), agentController.createDualRunEvaluation);
router.get('/evaluations/summary', agentController.getEvaluationSummary);
router.get('/evaluations/:evaluationId', validateParams(evaluationIdParamSchema), agentController.getEvaluation);
router.get('/gold-set', agentController.listGoldSetExamples);

export default router;
