const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('chatGpt adapter delegates to provider.generateObject and returns the extracted product name', async () => {
  applyTestEnv();

  const { createChatGpt } = require('../../dist/config/chatGpt.js');

  const calls = [];
  const chatGpt = createChatGpt({
    async generateObject(request) {
      calls.push(request);
      return {
        policy: request.policy,
        model: 'policy-mini-model',
        text: '{"productName":"Hince Mood Enhancer"}',
        object: {
          productName: 'Hince Mood Enhancer',
        },
      };
    },
  });

  const result = await chatGpt('1. hince mood enhancer, 2. lip tint');

  assert.equal(result, 'Hince Mood Enhancer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].policy, 'mini-default');
  assert.match(calls[0].systemPrompt, /Return JSON only/);
});
