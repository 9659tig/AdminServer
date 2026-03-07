const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('agent controller maps retry and state errors to explicit HTTP responses', async () => {
  applyTestEnv();

  const { createAgentController } = require('../../dist/agent/http/agentController.js');

  const controller = createAgentController({
    orchestrator: {
      async startTask() {
        throw new Error('unexpected');
      },
      async getTaskDetails() {
        return undefined;
      },
      async retryTask() {
        throw new Error('Retry step not found: missing-step');
      },
      async reviewTask() {
        throw new Error('Invalid task status transition: RUNNING -> DONE');
      },
    },
  });

  const retryReq = createMockRequest({
    method: 'POST',
    path: '/agent/tasks/task-1/retry',
    params: { taskId: 'task-1' },
    validated: {
      params: { taskId: 'task-1' },
      body: { fromStepId: 'missing-step' },
    },
    log: createNoopLogger(),
  });
  const retryRes = createMockResponse();
  await controller.retryTask(retryReq, retryRes);

  assert.equal(retryRes.statusCode, 400);
  assert.deepEqual(retryRes.body, {
    error: 'Invalid retry request',
    message: 'Retry step not found: missing-step',
  });

  const reviewReq = createMockRequest({
    method: 'POST',
    path: '/agent/tasks/task-1/review',
    params: { taskId: 'task-1' },
    validated: {
      params: { taskId: 'task-1' },
      body: { action: 'approve' },
    },
    log: createNoopLogger(),
  });
  const reviewRes = createMockResponse();
  await controller.reviewTask(reviewReq, reviewRes);

  assert.equal(reviewRes.statusCode, 409);
  assert.deepEqual(reviewRes.body, {
    error: 'Invalid task state',
    message: 'Invalid task status transition: RUNNING -> DONE',
  });
});
