const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('./helpers/httpMocks');
const { applyTestEnv } = require('./helpers/testEnv');

test('productName route is POST-only and validates the new JSON body contract', async () => {
  applyTestEnv();

  const router = require('../../dist/routers/router.js').default;
  const { validateBody } = require('../../dist/middleware/validate.js');
  const { productNameBodySchema } = require('../../dist/validation/schemas.js');
  const routeLayers = router.stack.filter((layer) => layer.route && layer.route.path === '/productName');

  assert.equal(routeLayers.length, 1);
  assert.equal(routeLayers[0].route.methods.post, true);
  assert.equal(routeLayers[0].route.methods.get, undefined);

  const req = createMockRequest({
    body: { candidates: [] },
    log: createNoopLogger(),
    validated: {},
  });
  const res = createMockResponse();

  let nextCalled = false;
  validateBody(productNameBodySchema)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: '입력 형식 에러',
    message: 'candidates는 최소 1개 이상이어야 합니다.',
  });

  const parsed = productNameBodySchema.parse({
    candidates: ['sample product'],
  });
  assert.deepEqual(parsed, {
    candidates: ['sample product'],
  });
});
