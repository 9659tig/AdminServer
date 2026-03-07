const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('agent routes and schemas enforce the Phase 1 API contract', async () => {
  applyTestEnv();

  const router = require('../../dist/routers/agentRouter.js').default;
  const { validateBody } = require('../../dist/middleware/validate.js');
  const {
    createAgentTaskSchema,
    reviewTaskSchema,
  } = require('../../dist/validation/agentSchemas.js');

  const routeSignatures = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  assert.deepEqual(routeSignatures, [
    { path: '/tasks', methods: ['post'] },
    { path: '/tasks/:taskId', methods: ['get'] },
    { path: '/tasks/:taskId/retry', methods: ['post'] },
    { path: '/tasks/:taskId/review', methods: ['post'] },
  ]);

  const invalidVideoReq = createMockRequest({
    body: { taskType: 'AUTO_PRODUCT_FROM_VIDEO' },
    validated: {},
    log: createNoopLogger(),
  });
  const invalidVideoRes = createMockResponse();
  validateBody(createAgentTaskSchema)(invalidVideoReq, invalidVideoRes, () => {});

  assert.equal(invalidVideoRes.statusCode, 400);
  assert.deepEqual(invalidVideoRes.body, {
    error: '입력 형식 에러',
    message: 'AUTO_PRODUCT_FROM_VIDEO에는 videoUrl이 필요합니다.',
  });

  const invalidEditReq = createMockRequest({
    body: { action: 'edit' },
    validated: {},
    log: createNoopLogger(),
  });
  const invalidEditRes = createMockResponse();
  validateBody(reviewTaskSchema)(invalidEditReq, invalidEditRes, () => {});

  assert.equal(invalidEditRes.statusCode, 400);
  assert.deepEqual(invalidEditRes.body, {
    error: '입력 형식 에러',
    message: 'edit 액션에는 editedFields가 필요합니다.',
  });

  const invalidRejectReq = createMockRequest({
    body: { action: 'reject' },
    validated: {},
    log: createNoopLogger(),
  });
  const invalidRejectRes = createMockResponse();
  validateBody(reviewTaskSchema)(invalidRejectReq, invalidRejectRes, () => {});

  assert.equal(invalidRejectRes.statusCode, 400);
  assert.deepEqual(invalidRejectRes.body, {
    error: '입력 형식 에러',
    message: 'reject 액션에는 reason이 필요합니다.',
  });
});
