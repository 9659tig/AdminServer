const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('./helpers/testEnv');
const { createMockRequest, createMockResponse, createNoopLogger } = require('./helpers/httpMocks');

test('videoSource controller returns an env-based source video URL and downloadEnabled flag', async () => {
  applyTestEnv();
  process.env.SOURCE_VIDEO_DOWNLOAD_TRIGGER_URL = 'https://example.com/download';

  const { resetEnvCache } = require('../../dist/config/env.js');
  resetEnvCache();

  const videoController = require('../../dist/controllers/videoController.js');
  const req = createMockRequest({
    method: 'GET',
    path: '/videoSource',
    validated: {
      query: {
        name: 'Creator/Test Video',
      },
    },
    log: createNoopLogger(),
  });
  const res = createMockResponse();

  await videoController.getSourceVideoConfig(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    url: 'https://test-bucket.s3.ap-northeast-2.amazonaws.com/Creator%2FTest%20Video.mp4',
    downloadEnabled: true,
  });

  delete process.env.SOURCE_VIDEO_DOWNLOAD_TRIGGER_URL;
  resetEnvCache();
});

test('videoSource download controller returns 501 when the trigger URL is not configured', async () => {
  applyTestEnv();
  delete process.env.SOURCE_VIDEO_DOWNLOAD_TRIGGER_URL;

  const { resetEnvCache } = require('../../dist/config/env.js');
  resetEnvCache();

  const videoController = require('../../dist/controllers/videoController.js');
  const req = createMockRequest({
    method: 'POST',
    path: '/videoSource/download',
    validated: {
      body: {
        videoUrl: 'https://www.youtube.com/watch?v=source-video',
        name: 'Creator/Test Video',
      },
    },
    log: createNoopLogger(),
  });
  const res = createMockResponse();

  await videoController.requestSourceVideoDownload(req, res);

  assert.equal(res.statusCode, 501);
  assert.deepEqual(res.body, {
    error: '설정 에러',
    message: '소스 영상 다운로드 트리거가 설정되지 않았습니다.',
  });
});
