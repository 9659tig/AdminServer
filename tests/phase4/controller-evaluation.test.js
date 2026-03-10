const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('agent controller returns evidence, evaluation summary, and gold-set responses', async () => {
  applyTestEnv();

  const { createAgentController } = require('../../dist/agent/http/agentController.js');

  const controller = createAgentController({
    orchestrator: {
      async startTask() {},
      async getTaskDetails() {},
      async retryTask() {},
      async reviewTask() {},
      async getTaskEvidence() {
        return {
          taskId: 'task-1',
          evidence: [{ sourceType: 'vision', summary: 'compact visible' }],
          selectedProductName: 'Laneige Neo Cushion',
          confidence: 0.81,
        };
      },
    },
    dualRunService: {
      async run(payload) {
        return {
          evaluationId: 'eval-1',
          createdAt: '2026-03-08T00:00:00.000Z',
          input: payload.input,
          iterations: [],
          metrics: {
            iterations: 0,
            taskSuccessRate: 0,
            failureRate: 0,
            evidenceCoverageScore: 0,
            consistencyScore: 1,
            avgLatencyMs: 0,
            avgConfidence: 0,
          },
        };
      },
      async get() {
        return undefined;
      },
      async getSummary() {
        return {
          totalEvaluations: 1,
          avgTaskSuccessRate: 0.8,
          avgFailureRate: 0.2,
          avgTop1MatchRate: 0.6,
          avgTop3MatchRate: 0.9,
          avgConsistencyScore: 0.85,
          avgEvidenceCoverageScore: 0.7,
          avgLatencyMs: 120,
          goldSetSize: 4,
          sourceScores: [{ sourceType: 'vision', scoreSum: 3, totalCount: 4, averageScore: 0.75, updatedAt: '2026-03-08T00:00:00.000Z' }],
        };
      },
    },
    goldSetStore: {
      async add() {},
      async size() { return 1; },
      async reset() {},
      async list() {
        return [
          {
            exampleId: 'example-1',
            expectedProduct: 'Laneige Neo Cushion',
            reviewAction: 'approve',
            taskInput: { taskType: 'AUTO_PRODUCT_FROM_CLIP' },
            candidateNames: ['Laneige Neo Cushion'],
            evidenceSources: ['vision'],
            createdAt: '2026-03-08T00:00:00.000Z',
          },
        ];
      },
    },
  });

  const evidenceReq = createMockRequest({
    method: 'GET',
    path: '/agent/tasks/task-1/evidence',
    validated: { params: { taskId: 'task-1' } },
    log: createNoopLogger(),
  });
  const evidenceRes = createMockResponse();
  await controller.getTaskEvidence(evidenceReq, evidenceRes);
  assert.equal(evidenceRes.statusCode, 200);
  assert.equal(evidenceRes.body.selectedProductName, 'Laneige Neo Cushion');

  const evaluationReq = createMockRequest({
    method: 'POST',
    path: '/agent/evaluations/dual-run',
    validated: {
      body: {
        input: {
          taskType: 'AUTO_PRODUCT_FROM_CLIP',
          clipContext: {
            clipId: 'clip-1',
            imageUrls: ['https://example.com/frame-1.jpg'],
          },
        },
        iterations: 3,
      },
    },
    log: createNoopLogger(),
  });
  const evaluationRes = createMockResponse();
  await controller.createDualRunEvaluation(evaluationReq, evaluationRes);
  assert.equal(evaluationRes.statusCode, 201);
  assert.equal(evaluationRes.body.evaluationId, 'eval-1');

  const summaryReq = createMockRequest({
    method: 'GET',
    path: '/agent/evaluations/summary',
    validated: {},
    log: createNoopLogger(),
  });
  const summaryRes = createMockResponse();
  await controller.getEvaluationSummary(summaryReq, summaryRes);
  assert.equal(summaryRes.statusCode, 200);
  assert.equal(summaryRes.body.goldSetSize, 4);

  const goldSetReq = createMockRequest({
    method: 'GET',
    path: '/agent/gold-set',
    validated: {},
    log: createNoopLogger(),
  });
  const goldSetRes = createMockResponse();
  await controller.listGoldSetExamples(goldSetReq, goldSetRes);
  assert.equal(goldSetRes.statusCode, 200);
  assert.equal(goldSetRes.body.count, 1);
});
