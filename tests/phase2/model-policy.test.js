const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('model policies resolve provider routing and can be swapped without code changes', async () => {
  applyTestEnv();

  const {
    createModelPolicyRegistry,
  } = require('../../dist/agent/providers/llm/modelPolicy.js');

  const registry = createModelPolicyRegistry({
    'mini-default': {
      model: 'test-mini-model',
      temperature: 0.05,
    },
    '4o-escalation': {
      model: 'test-4o-model',
    },
  });

  assert.deepEqual(registry.resolve('mini-default'), {
    name: 'mini-default',
    provider: 'openai',
    mode: 'chat',
    model: 'test-mini-model',
    temperature: 0.05,
    maxOutputTokens: 400,
  });

  assert.equal(registry.resolve('4o-escalation').model, 'test-4o-model');
  assert.equal(registry.resolve('transcribe-default').mode, 'transcription');
});
