const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { waitFor } = require('./helpers/waitFor');

test('failed steps can be retried from a specific step and complete on the second run', async () => {
  applyTestEnv();

  const { AgentOrchestrator } = require('../../dist/agent/core/orchestrator.js');
  const { createInMemoryAgentTaskStore } = require('../../dist/agent/core/taskStore.js');
  const { createInMemoryAgentStepStore } = require('../../dist/agent/core/stepStore.js');
  const { createInMemoryFeedbackStore } = require('../../dist/agent/memory/feedbackStore.js');
  const { ToolRegistry } = require('../../dist/agent/tools/toolRegistry.js');

  let attempts = 0;
  const toolRegistry = new ToolRegistry();
  toolRegistry.register('unstable_context', {
    async run(input) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient upstream failure');
      }

      return {
        context: {
          recovered: true,
          source: input.source,
        },
      };
    },
  });
  toolRegistry.register('prepare_review_payload', {
    async run(input) {
      return {
        reviewPayload: {
          summary: 'Recovered task is ready for review.',
          context: input.context,
          recommendation: 'review_required',
        },
      };
    },
  });

  const planner = {
    createPlan(input) {
      return {
        version: 'test-rule-v1',
        steps: [
          {
            stepId: 'unstable-step',
            tool: 'unstable_context',
            input: { source: input.videoUrl },
          },
          {
            stepId: 'prepare-review-payload',
            tool: 'prepare_review_payload',
            input: {
              context: '{{unstable-step.output.context}}',
            },
          },
        ],
      };
    },
  };

  const orchestrator = new AgentOrchestrator({
    taskStore: createInMemoryAgentTaskStore(),
    stepStore: createInMemoryAgentStepStore(),
    planner,
    toolRegistry,
    feedbackStore: createInMemoryFeedbackStore(),
  });

  const taskId = await orchestrator.startTask({
    taskType: 'AUTO_PRODUCT_FROM_VIDEO',
    videoUrl: 'https://www.youtube.com/watch?v=phase1-retry',
  });

  const failed = await waitFor(async () => {
    const current = await orchestrator.getTaskDetails(taskId);
    return current && current.task.status === 'FAILED' ? current : undefined;
  });

  assert.equal(failed.task.status, 'FAILED');
  assert.equal(failed.task.error, 'transient upstream failure');
  assert.equal(failed.steps[0].status, 'FAILED');
  assert.equal(failed.steps[0].retryCount, 0);
  assert.equal(failed.progress.failedSteps, 1);

  await assert.rejects(
    () => orchestrator.retryTask(taskId, 'missing-step'),
    /Retry step not found: missing-step/,
  );

  await orchestrator.retryTask(taskId, 'unstable-step');

  const recovered = await waitFor(async () => {
    const current = await orchestrator.getTaskDetails(taskId);
    return current && current.task.status === 'NEEDS_REVIEW' ? current : undefined;
  });

  assert.equal(recovered.task.status, 'NEEDS_REVIEW');
  assert.equal(recovered.steps[0].status, 'DONE');
  assert.equal(recovered.steps[0].retryCount, 1);
  assert.equal(recovered.steps[1].status, 'DONE');
  assert.equal(recovered.progress.completedSteps, 2);
  assert.equal(recovered.task.result.reviewPayload.context.recovered, true);
});
