import express, { Router } from 'express';
import { agentController } from '../agent/http/agentController';
import { validateBody, validateParams } from '../middleware/validate';
import { createAgentTaskSchema, reviewTaskSchema, retryTaskSchema, taskIdParamSchema } from '../validation/agentSchemas';

const router: Router = express.Router();

router.post('/tasks', validateBody(createAgentTaskSchema), agentController.createTask);
router.get('/tasks/:taskId', validateParams(taskIdParamSchema), agentController.getTask);
router.post('/tasks/:taskId/review', validateParams(taskIdParamSchema), validateBody(reviewTaskSchema), agentController.reviewTask);
router.post('/tasks/:taskId/retry', validateParams(taskIdParamSchema), validateBody(retryTaskSchema), agentController.retryTask);

export default router;
