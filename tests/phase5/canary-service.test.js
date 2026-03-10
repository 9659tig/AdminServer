const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('CanaryService makes deterministic rollout decisions and supports forced strategy overrides', async () => {
  applyTestEnv();

  const { CanaryService, createInMemoryCanaryConfigStore } = require('../../dist/agent/rollout/canaryService.js');

  const service = new CanaryService(createInMemoryCanaryConfigStore());

  await service.updateConfig({ rolloutPercentage: 50 });
  const first = await service.decide('channel-1:video-1');
  const second = await service.decide('channel-1:video-1');

  assert.equal(first.strategy, second.strategy);
  assert.equal(first.bucket, second.bucket);
  assert.equal(first.rolloutPercentage, 50);

  await service.updateConfig({ forceStrategy: 'legacy' });
  const forced = await service.decide('channel-1:video-1');
  assert.equal(forced.strategy, 'legacy');
  assert.equal(forced.forceStrategy, 'legacy');
});
