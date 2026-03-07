async function waitFor(assertion, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 20;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await assertion();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

module.exports = {
  waitFor,
};
