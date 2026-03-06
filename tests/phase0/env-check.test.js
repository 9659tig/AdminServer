const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('./helpers/testEnv');

test('env validation fails fast with a clear startup error', async () => {
  applyTestEnv();
  const { resetEnvCache, validateEnv } = require('../../dist/config/env.js');

  delete process.env.OPENAI_API_KEY;
  resetEnvCache();

  assert.throws(() => validateEnv(), /OPENAI_API_KEY/);

  applyTestEnv();
  resetEnvCache();
  assert.doesNotThrow(() => validateEnv());
});
