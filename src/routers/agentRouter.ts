import express, { Router } from 'express';
import os from 'os';
import multer from 'multer';
import { agentController } from '../agent/http/agentController';
import { validateBody, validateParams } from '../middleware/validate';
import {
    canaryDecisionSchema,
    createAgentTaskSchema,
    dualRunEvaluationSchema,
    evaluationIdParamSchema,
    reviewTaskSchema,
    retryTaskSchema,
    taskIdParamSchema,
    updateCanaryConfigSchema,
} from '../validation/agentSchemas';

const router: Router = express.Router();
const upload = multer({ dest: os.tmpdir() });

// 기존 라우트
router.post('/tasks', validateBody(createAgentTaskSchema), agentController.createTask);
router.get('/tasks/:taskId', validateParams(taskIdParamSchema), agentController.getTask);
router.get('/tasks/:taskId/evidence', validateParams(taskIdParamSchema), agentController.getTaskEvidence);
router.post('/tasks/:taskId/review', validateParams(taskIdParamSchema), validateBody(reviewTaskSchema), agentController.reviewTask);
router.post('/tasks/:taskId/retry', validateParams(taskIdParamSchema), validateBody(retryTaskSchema), agentController.retryTask);
router.post('/evaluations/dual-run', validateBody(dualRunEvaluationSchema), agentController.createDualRunEvaluation);
router.get('/evaluations/summary', agentController.getEvaluationSummary);
router.get('/evaluations/:evaluationId', validateParams(evaluationIdParamSchema), agentController.getEvaluation);
router.get('/gold-set', agentController.listGoldSetExamples);
router.get('/canary/config', agentController.getCanaryConfig);
router.post('/canary/config', validateBody(updateCanaryConfigSchema), agentController.updateCanaryConfig);
router.post('/canary/decide', validateBody(canaryDecisionSchema), agentController.decideCanaryStrategy);

// 영상 파일 업로드 기반 라우트
router.post('/video/extract', upload.single('videoFile'), agentController.extractFromVideo);

export default router;
