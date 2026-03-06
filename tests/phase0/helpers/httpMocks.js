const { EventEmitter } = require('node:events');

function createNoopLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    child() {
      return createNoopLogger();
    },
  };
}

function createMockRequest(overrides = {}) {
  const headers = {};
  Object.entries(overrides.headers || {}).forEach(([key, value]) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    method: overrides.method || 'GET',
    path: overrides.path || '/',
    body: overrides.body || {},
    query: overrides.query || {},
    params: overrides.params || {},
    validated: overrides.validated || {},
    requestId: overrides.requestId,
    log: overrides.log || createNoopLogger(),
    header(name) {
      return headers[name.toLowerCase()];
    },
  };
}

function createMockResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.body = undefined;

  response.setHeader = (name, value) => {
    response.headers[name.toLowerCase()] = value;
  };

  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };

  response.json = (body) => {
    response.body = body;
    return response;
  };

  response.send = (body) => {
    response.body = body;
    return response;
  };

  return response;
}

module.exports = {
  createMockRequest,
  createMockResponse,
  createNoopLogger,
};
