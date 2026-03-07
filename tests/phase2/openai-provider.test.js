const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('OpenAIProvider routes requests through model policy aliases and validates structured output', async () => {
  applyTestEnv();

  const { OpenAIProvider } = require('../../dist/agent/providers/llm/OpenAIProvider.js');
  const { createModelPolicyRegistry } = require('../../dist/agent/providers/llm/modelPolicy.js');

  const requests = [];
  const mockClient = {
    chat: {
      completions: {
        async create(request) {
          requests.push(request);

          if (request.response_format) {
            return {
              choices: [
                {
                  message: {
                    content: '```json\n{"productName":"Laneige Lip Sleeping Mask"}\n```',
                  },
                },
              ],
            };
          }

          return {
            choices: [
              {
                message: {
                  content: 'policy-routed-text',
                },
              },
            ],
          };
        },
      },
    },
    audio: {
      transcriptions: {
        async create(request) {
          requests.push(request);
          return { text: 'phase2 transcription' };
        },
      },
    },
  };

  const provider = new OpenAIProvider({
    client: mockClient,
    policyRegistry: createModelPolicyRegistry({
      'mini-default': { model: 'policy-mini-model' },
      'transcribe-default': { model: 'policy-transcribe-model' },
    }),
  });

  const textResult = await provider.generateText({
    policy: 'mini-default',
    userPrompt: 'hello',
    systemPrompt: 'system',
  });

  assert.equal(textResult.text, 'policy-routed-text');
  assert.equal(textResult.model, 'policy-mini-model');
  assert.equal(requests[0].model, 'policy-mini-model');
  assert.deepEqual(requests[0].messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'hello' },
  ]);

  const objectResult = await provider.generateObject({
    policy: 'mini-default',
    userPrompt: 'select one product',
    schema: z.object({
      productName: z.string().min(1),
    }),
  });

  assert.equal(objectResult.object.productName, 'Laneige Lip Sleeping Mask');
  assert.equal(requests[1].response_format.type, 'json_object');
  assert.equal(requests[1].model, 'policy-mini-model');

  const transcription = await provider.transcribe({
    policy: 'transcribe-default',
    file: 'fake-audio-file',
  });

  assert.equal(transcription.text, 'phase2 transcription');
  assert.equal(transcription.model, 'policy-transcribe-model');
  assert.equal(requests[2].model, 'policy-transcribe-model');
});

test('OpenAIProvider rejects invalid structured output against the requested schema', async () => {
  applyTestEnv();

  const { OpenAIProvider } = require('../../dist/agent/providers/llm/OpenAIProvider.js');
  const { createModelPolicyRegistry } = require('../../dist/agent/providers/llm/modelPolicy.js');

  const provider = new OpenAIProvider({
    client: {
      chat: {
        completions: {
          async create() {
            return {
              choices: [
                {
                  message: {
                    content: '{"unexpected":"shape"}',
                  },
                },
              ],
            };
          },
        },
      },
    },
    policyRegistry: createModelPolicyRegistry(),
  });

  await assert.rejects(
    () => provider.generateObject({
      policy: 'mini-default',
      userPrompt: 'return product',
      schema: z.object({
        productName: z.string().min(1),
      }),
    }),
    /Structured output validation failed/,
  );
});
