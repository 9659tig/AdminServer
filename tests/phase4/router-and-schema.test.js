const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('agent router exposes the Phase 4 evidence, evaluation, and gold-set routes', async () => {
  applyTestEnv();

  const router = require('../../dist/routers/agentRouter.js').default;
  const routeSignatures = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  assert.deepEqual(
    routeSignatures.filter((route) =>
      route.path.startsWith('/tasks') ||
      route.path.startsWith('/evaluations') ||
      route.path === '/gold-set'
    ),
    [
      { path: '/evaluations/:evaluationId', methods: ['get'] },
      { path: '/evaluations/dual-run', methods: ['post'] },
      { path: '/evaluations/summary', methods: ['get'] },
      { path: '/gold-set', methods: ['get'] },
      { path: '/tasks', methods: ['post'] },
      { path: '/tasks/:taskId', methods: ['get'] },
      { path: '/tasks/:taskId/evidence', methods: ['get'] },
      { path: '/tasks/:taskId/retry', methods: ['post'] },
      { path: '/tasks/:taskId/review', methods: ['post'] },
    ],
  );
});

test('dual-run evaluation schema validates the nested agent input and iterations bounds', async () => {
  applyTestEnv();

  const { validateBody } = require('../../dist/middleware/validate.js');
  const { dualRunEvaluationSchema } = require('../../dist/validation/agentSchemas.js');

  const invalidReq = createMockRequest({
    body: {
      input: {
        taskType: 'AUTO_PRODUCT_FROM_CLIP',
        clipContext: {
          clipId: 'clip-1',
          imageUrls: ['https://example.com/frame-1.jpg'],
        },
      },
      iterations: 11,
    },
    validated: {},
    log: createNoopLogger(),
  });
  const invalidRes = createMockResponse();
  validateBody(dualRunEvaluationSchema)(invalidReq, invalidRes, () => {});

  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, {
    error: '입력 형식 에러',
    message: 'Number must be less than or equal to 10',
  });

  const parsed = dualRunEvaluationSchema.parse({
    input: {
      taskType: 'AUTO_PRODUCT_FROM_CLIP',
      clipContext: {
        clipId: 'clip-1',
        spokenText: '이건 라네즈 네오 쿠션이에요.',
      },
    },
    goldLabel: 'Laneige Neo Cushion',
    iterations: 3,
  });

  assert.equal(parsed.input.clipContext.spokenText, '이건 라네즈 네오 쿠션이에요.');
  assert.equal(parsed.iterations, 3);
});
