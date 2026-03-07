const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { waitFor } = require('./helpers/waitFor');

test('agent orchestrator runs asynchronously and exposes progress, output, and feedback', async () => {
  applyTestEnv();

  const { AgentOrchestrator } = require('../../dist/agent/core/orchestrator.js');
  const { createInMemoryAgentTaskStore } = require('../../dist/agent/core/taskStore.js');
  const { createInMemoryAgentStepStore } = require('../../dist/agent/core/stepStore.js');
  const { createInMemoryFeedbackStore } = require('../../dist/agent/memory/feedbackStore.js');
  const { RulePlanner } = require('../../dist/agent/planner/RulePlanner.js');
  const { ToolRegistry } = require('../../dist/agent/tools/toolRegistry.js');
  const {
    BuildVideoContextTool,
    BuildClipContextTool,
    PrepareReviewPayloadTool,
  } = require('../../dist/agent/tools/contextTools.js');

  const toolRegistry = new ToolRegistry();
  toolRegistry.register('build_video_context', new BuildVideoContextTool());
  toolRegistry.register('build_clip_context', new BuildClipContextTool());
  toolRegistry.register('prepare_review_payload', new PrepareReviewPayloadTool());

  const orchestrator = new AgentOrchestrator({
    taskStore: createInMemoryAgentTaskStore(),
    stepStore: createInMemoryAgentStepStore(),
    planner: new RulePlanner(),
    toolRegistry,
    feedbackStore: createInMemoryFeedbackStore(),
  });

  const taskId = await orchestrator.startTask({
    taskType: 'AUTO_PRODUCT_FROM_VIDEO',
    videoUrl: 'https://www.youtube.com/watch?v=phase1-video',
    channelCategory: 'beauty',
  });

  const details = await waitFor(async () => {
    const current = await orchestrator.getTaskDetails(taskId);
    return current && current.task.status === 'NEEDS_REVIEW' ? current : undefined;
  });

  assert.equal(details.task.status, 'NEEDS_REVIEW');
  assert.equal(details.progress.totalSteps, 2);
  assert.equal(details.progress.completedSteps, 2);
  assert.equal(details.progress.failedSteps, 0);
  assert.equal(details.progress.pendingSteps, 0);
  assert.equal(details.progress.runningSteps, 0);
  assert.equal(details.progress.completionRatio, 1);
  assert.equal(details.feedback.length, 0);
  assert.equal(details.steps[0].status, 'DONE');
  assert.equal(details.steps[1].status, 'DONE');
  assert.equal(details.steps[1].output.reviewPayload.recommendation, 'review_required');

  const reviewed = await orchestrator.reviewTask(taskId, {
    action: 'approve',
    reason: 'phase1-lifecycle-ok',
  });

  assert.equal(reviewed.task.status, 'DONE');
  assert.equal(reviewed.feedback.length, 1);
  assert.equal(reviewed.feedback[0].action, 'approve');
  assert.equal(reviewed.task.review.action, 'approve');
});
