const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('agent router exposes Phase 5 canary routes', async () => {
  applyTestEnv();

  const router = require('../../dist/routers/agentRouter.js').default;
  const signatures = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));

  assert.ok(signatures.some((route) => route.path === '/canary/config' && route.methods.join(',') === 'get'));
  assert.ok(signatures.some((route) => route.path === '/canary/config' && route.methods.join(',') === 'post'));
  assert.ok(signatures.some((route) => route.path === '/canary/decide' && route.methods.join(',') === 'post'));
});

test('agent controller returns canary config and canary decisions', async () => {
  applyTestEnv();

  const { createAgentController } = require('../../dist/agent/http/agentController.js');
  const controller = createAgentController({
    orchestrator: {},
    dualRunService: {},
    goldSetStore: { async list() { return []; } },
    canaryService: {
      async getConfig() {
        return { rolloutPercentage: 25, updatedAt: '2026-03-08T00:00:00.000Z' };
      },
      async updateConfig(patch) {
        return { rolloutPercentage: patch.rolloutPercentage ?? 25, forceStrategy: patch.forceStrategy, updatedAt: '2026-03-08T00:00:00.000Z' };
      },
      async decide(routingKey) {
        return { strategy: 'agent', bucket: 12, rolloutPercentage: 25, routingKey };
      },
    },
  });

  const getReq = createMockRequest({ method: 'GET', path: '/agent/canary/config', validated: {}, log: createNoopLogger() });
  const getRes = createMockResponse();
  await controller.getCanaryConfig(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.rolloutPercentage, 25);

  const postReq = createMockRequest({
    method: 'POST',
    path: '/agent/canary/config',
    validated: { body: { rolloutPercentage: 40, forceStrategy: 'agent' } },
    log: createNoopLogger(),
  });
  const postRes = createMockResponse();
  await controller.updateCanaryConfig(postReq, postRes);
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.body.rolloutPercentage, 40);

  const decideReq = createMockRequest({
    method: 'POST',
    path: '/agent/canary/decide',
    validated: { body: { routingKey: 'channel-1:video-1' } },
    log: createNoopLogger(),
  });
  const decideRes = createMockResponse();
  await controller.decideCanaryStrategy(decideReq, decideRes);
  assert.equal(decideRes.statusCode, 200);
  assert.equal(decideRes.body.strategy, 'agent');
});
