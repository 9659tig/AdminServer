const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockRequest, createMockResponse } = require('./helpers/httpMocks');

test('request context middleware preserves or creates a request id', async () => {
  const { requestContextMiddleware } = require('../../dist/middleware/requestContext.js');

  const reqWithHeader = createMockRequest({
    method: 'GET',
    path: '/health',
    headers: {
      'x-request-id': 'phase0-request-id',
    },
  });
  const resWithHeader = createMockResponse();

  let nextCalled = false;
  requestContextMiddleware(reqWithHeader, resWithHeader, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(reqWithHeader.requestId, 'phase0-request-id');
  assert.equal(resWithHeader.headers['x-request-id'], 'phase0-request-id');
  assert.ok(reqWithHeader.log);

  const reqWithoutHeader = createMockRequest({
    method: 'GET',
    path: '/health',
  });
  const resWithoutHeader = createMockResponse();
  requestContextMiddleware(reqWithoutHeader, resWithoutHeader, () => {});

  assert.ok(reqWithoutHeader.requestId);
  assert.equal(resWithoutHeader.headers['x-request-id'], reqWithoutHeader.requestId);
});
