const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createMockRequest, createMockResponse, createNoopLogger } = require('./helpers/httpMocks');
const { applyTestEnv } = require('./helpers/testEnv');

test('clip route returns 202 within 1 second while background processing continues', async () => {
  applyTestEnv();

  const { createAddNewClipHandler } = require('../../dist/controllers/clipController.js');
  const { createInMemoryTaskStore } = require('../../dist/core/taskStore.js');

  let processorStarted = false;
  const handler = createAddNewClipHandler({
    taskStore: createInMemoryTaskStore(),
    async processClipTask() {
      processorStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    },
  });

  const req = createMockRequest({
    method: 'POST',
    path: '/clip',
    requestId: 'phase0-async-request',
    log: createNoopLogger(),
    validated: {
      body: {
        startTime: 1,
        endTime: 5,
        videoSrc: 'video.mp4',
        channelId: 'channel-1',
        videoUrl: 'https://www.youtube.com/watch?v=test-async',
      },
    },
  });
  const res = createMockResponse();

  const startedAt = performance.now();
  await handler(req, res);
  const durationMs = performance.now() - startedAt;

  assert.equal(res.statusCode, 202);
  assert.ok(durationMs < 1000, `Expected 202 response within 1 second, received in ${durationMs}ms`);

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(processorStarted, true);
});
