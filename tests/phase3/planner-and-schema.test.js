const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { createMockRequest, createMockResponse, createNoopLogger } = require('../phase0/helpers/httpMocks');

test('RulePlanner uses the product extraction workflow for clip tasks and preserves the simple video flow when no clip context exists', async () => {
  applyTestEnv();

  const { RulePlanner } = require('../../dist/agent/planner/RulePlanner.js');
  const planner = new RulePlanner();

  const clipPlan = planner.createPlan({
    taskType: 'AUTO_PRODUCT_FROM_CLIP',
    channelCategory: 'beauty',
    clipContext: {
      clipId: 'clip-1',
      imageUrls: ['https://example.com/frame-1.jpg'],
    },
    legacyCandidates: ['legacy product'],
  });

  assert.equal(clipPlan.version, 'workflow-v1');
  assert.deepEqual(clipPlan.steps.map((step) => step.tool), [
    'build_clip_context',
    'product_extraction_workflow',
    'prepare_review_payload',
  ]);

  const videoPlan = planner.createPlan({
    taskType: 'AUTO_PRODUCT_FROM_VIDEO',
    videoUrl: 'https://www.youtube.com/watch?v=phase3-video',
  });

  assert.equal(videoPlan.version, 'rule-v1');
  assert.deepEqual(videoPlan.steps.map((step) => step.tool), [
    'build_video_context',
    'prepare_review_payload',
  ]);
});

test('agent schema accepts clipLink as a transcript source for clip product extraction', async () => {
  applyTestEnv();

  const { createAgentTaskSchema } = require('../../dist/validation/agentSchemas.js');
  const { validateBody } = require('../../dist/middleware/validate.js');

  const invalidReq = createMockRequest({
    body: {
      taskType: 'AUTO_PRODUCT_FROM_CLIP',
      clipContext: {
        clipId: 'clip-1',
        imageUrls: [],
      },
    },
    validated: {},
    log: createNoopLogger(),
  });
  const invalidRes = createMockResponse();
  validateBody(createAgentTaskSchema)(invalidReq, invalidRes, () => {});

  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.body, {
    error: '입력 형식 에러',
    message: 'AUTO_PRODUCT_FROM_CLIP에는 imageUrls, spokenText, clipLink 중 하나가 필요합니다.',
  });

  const spokenTextParsed = createAgentTaskSchema.parse({
    taskType: 'AUTO_PRODUCT_FROM_CLIP',
    clipContext: {
      clipId: 'clip-1',
      spokenText: '이거 나이트 리페어예요.',
    },
  });

  assert.equal(spokenTextParsed.clipContext.spokenText, '이거 나이트 리페어예요.');

  const clipLinkParsed = createAgentTaskSchema.parse({
    taskType: 'AUTO_PRODUCT_FROM_CLIP',
    clipContext: {
      clipId: 'clip-2',
      clipLink: 'https://example.com/clip.mp4',
    },
  });

  assert.equal(clipLinkParsed.clipContext.clipLink, 'https://example.com/clip.mp4');
});
