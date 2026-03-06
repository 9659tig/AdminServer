const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse, createNoopLogger } = require('./helpers/httpMocks');
const { applyTestEnv } = require('./helpers/testEnv');

test('clip requests keep request-local video input without shared global state contamination', async () => {
  applyTestEnv();

  const { createAddNewClipHandler } = require('../../dist/controllers/clipController.js');
  const { createInMemoryTaskStore } = require('../../dist/core/taskStore.js');

  const store = createInMemoryTaskStore();
  const processed = [];
  const handler = createAddNewClipHandler({
    taskStore: store,
    async processClipTask(taskId, input) {
      processed.push({ taskId, input });
    },
  });

  const responses = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const req = createMockRequest({
      method: 'POST',
      path: '/clip',
      requestId: `request-${index}`,
      log: createNoopLogger(),
      validated: {
        body: {
        startTime: 1,
        endTime: 5,
        videoSrc: `video-${index}.mp4`,
        channelId: `channel-${index}`,
        videoUrl: `https://www.youtube.com/watch?v=test${index}`,
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);
    return res;
  }));

  responses.forEach((response) => assert.equal(response.statusCode, 202));

  await new Promise((resolve) => setTimeout(resolve, 50));

  const tasks = await store.list();
  assert.equal(tasks.length, 10);
  assert.equal(processed.length, 10);

  const videoUrls = processed.map((entry) => entry.input.videoUrl).sort();
  assert.deepEqual(videoUrls, Array.from({ length: 10 }, (_, index) => `https://www.youtube.com/watch?v=test${index}`).sort());
});
