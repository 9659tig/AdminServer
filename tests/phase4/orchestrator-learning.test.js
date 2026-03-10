const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { waitFor } = require('../phase1/helpers/waitFor');

test('AgentOrchestrator exposes task evidence and records review outcomes into gold-set/source scores', async () => {
  applyTestEnv();

  const { AgentOrchestrator } = require('../../dist/agent/core/orchestrator.js');
  const { createInMemoryAgentTaskStore } = require('../../dist/agent/core/taskStore.js');
  const { createInMemoryAgentStepStore } = require('../../dist/agent/core/stepStore.js');
  const { createInMemoryFeedbackStore } = require('../../dist/agent/memory/feedbackStore.js');
  const { createInMemoryGoldSetStore } = require('../../dist/agent/evaluation/goldSetStore.js');
  const { createInMemorySourceScoreStore } = require('../../dist/agent/evaluation/sourceScoreStore.js');
  const { RulePlanner } = require('../../dist/agent/planner/RulePlanner.js');
  const { ToolRegistry } = require('../../dist/agent/tools/toolRegistry.js');
  const { BuildClipContextTool, PrepareReviewPayloadTool } = require('../../dist/agent/tools/contextTools.js');

  const goldSetStore = createInMemoryGoldSetStore();
  const sourceScoreStore = createInMemorySourceScoreStore();
  const toolRegistry = new ToolRegistry();
  toolRegistry.register('build_clip_context', new BuildClipContextTool());
  toolRegistry.register('prepare_review_payload', new PrepareReviewPayloadTool());
  toolRegistry.register('product_extraction_workflow', {
    async run() {
      return {
        extraction: {
          status: 'READY_FOR_REVIEW',
          recommendation: 'approve_candidate',
          confidence: 0.84,
          selectedProduct: {
            name: 'Estee Lauder Advanced Night Repair',
            brand: 'Estee Lauder',
            category: 'skincare',
            confidence: 0.84,
            evidence: 'logo and transcript aligned',
            searchQuery: '에스티로더 어드밴스드 나이트 리페어',
            source: 'transcript',
          },
          allCandidates: [
            {
              name: 'Estee Lauder Advanced Night Repair',
              brand: 'Estee Lauder',
              category: 'skincare',
              confidence: 0.84,
              evidence: 'logo and transcript aligned',
              searchQuery: '에스티로더 어드밴스드 나이트 리페어',
              source: 'transcript',
            },
          ],
          vision: {
            products: [],
            sceneDescription: 'serum bottle',
            uncertainty: null,
            policyUsed: 'mini-default',
            escalated: true,
          },
          shoppingResults: [
            {
              source: 'coupang',
              productName: '에스티로더 어드밴스드 나이트 리페어 50ml',
              productUrl: 'https://example.com/night-repair',
              reviewCount: 1000,
              rank: 1,
            },
          ],
          evidence: [
            { sourceType: 'vision', summary: 'brown serum bottle' },
            { sourceType: 'transcript', summary: 'speaker mentions night repair' },
            { sourceType: 'shopping', summary: 'matching coupang listing found' },
          ],
          uncertainty: null,
          legacyComparison: {
            candidates: ['Estee Lauder Advanced Night Repair'],
            overlap: ['Estee Lauder Advanced Night Repair'],
            matched: true,
            selectedProduct: 'Estee Lauder Advanced Night Repair',
          },
        },
      };
    },
  });

  const orchestrator = new AgentOrchestrator({
    taskStore: createInMemoryAgentTaskStore(),
    stepStore: createInMemoryAgentStepStore(),
    planner: new RulePlanner(),
    toolRegistry,
    feedbackStore: createInMemoryFeedbackStore(),
    goldSetStore,
    sourceScoreStore,
  });

  const taskId = await orchestrator.startTask({
    taskType: 'AUTO_PRODUCT_FROM_CLIP',
    channelCategory: 'beauty',
    clipContext: {
      clipId: 'clip-1',
      imageUrls: ['https://example.com/frame-1.jpg'],
      spokenText: '에스티로더 나이트 리페어예요.',
    },
    legacyCandidates: ['Estee Lauder Advanced Night Repair'],
  });

  await waitFor(async () => {
    const details = await orchestrator.getTaskDetails(taskId);
    return details && details.task.status === 'NEEDS_REVIEW' ? details : undefined;
  });

  const evidenceView = await orchestrator.getTaskEvidence(taskId);
  assert.equal(evidenceView.selectedProductName, 'Estee Lauder Advanced Night Repair');
  assert.deepEqual(
    evidenceView.evidence.map((entry) => entry.sourceType),
    ['vision', 'transcript', 'shopping'],
  );

  await orchestrator.reviewTask(taskId, {
    action: 'edit',
    editedFields: {
      productName: 'Estee Lauder Advanced Night Repair Serum',
    },
    reason: 'formal product title',
  });

  const examples = await goldSetStore.list();
  assert.equal(examples.length, 1);
  assert.equal(examples[0].expectedProduct, 'Estee Lauder Advanced Night Repair Serum');
  assert.equal(examples[0].reviewAction, 'edit');

  const sourceScores = await sourceScoreStore.list();
  assert.equal(sourceScores.length, 3);
  sourceScores.forEach((score) => {
    assert.equal(score.averageScore, 0.5);
  });
});
