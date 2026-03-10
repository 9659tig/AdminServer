const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { createMockResponse } = require('../phase0/helpers/httpMocks');

test('legacy product search headers clearly mark the endpoint as deprecated', async () => {
  applyTestEnv();

  const { applyLegacyProductDeprecationHeaders } = require('../../dist/controllers/productController.js');
  const res = createMockResponse();

  applyLegacyProductDeprecationHeaders(res);

  assert.equal(res.headers.deprecation, 'true');
  assert.equal(res.headers.sunset, 'Wed, 30 Sep 2026 23:59:59 GMT');
  assert.equal(res.headers.link, '</agent/tasks>; rel="successor-version"');
  assert.equal(res.headers['x-legacy-status'], 'deprecated-use-agent-workflow');
});
