const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('FewShotBuilder injects approved examples and VerifierAgent downgrades weak results', async () => {
  applyTestEnv();

  const { FewShotBuilder } = require('../../dist/agent/memory/FewShotBuilder.js');
  const { createInMemoryGoldSetStore } = require('../../dist/agent/evaluation/goldSetStore.js');
  const { VerifierAgent } = require('../../dist/agent/verifier/VerifierAgent.js');
  const { createInMemorySourceScoreStore } = require('../../dist/agent/evaluation/sourceScoreStore.js');
  const { ProductExtractionWorkflow } = require('../../dist/agent/workflows/ProductExtractionWorkflow.js');

  const goldSetStore = createInMemoryGoldSetStore();
  await goldSetStore.add({
    exampleId: 'example-1',
    expectedProduct: 'Laneige Neo Cushion',
    reviewAction: 'approve',
    category: 'beauty',
    taskInput: { taskType: 'AUTO_PRODUCT_FROM_CLIP' },
    candidateNames: ['Laneige Neo Cushion'],
    evidenceSources: ['vision', 'shopping'],
    createdAt: '2026-03-08T00:00:00.000Z',
  });

  const fewShotBuilder = new FewShotBuilder({ goldSetStore });
  const prompt = await fewShotBuilder.buildForCategory('beauty', 2);
  assert.match(prompt, /Expected Product: Laneige Neo Cushion/);

  const sourceScoreStore = createInMemorySourceScoreStore();
  await sourceScoreStore.applyOutcome(['vision'], 0);
  await sourceScoreStore.applyOutcome(['shopping'], 0);
  const verifier = new VerifierAgent({
    sourceScoreStore,
    approvalThreshold: 0.78,
  });

  const generatedPrompts = [];
  const workflow = new ProductExtractionWorkflow({
    fewShotBuilder,
    verifier,
    visionTool: {
      async identify() {
        return {
          products: [
            {
              name: 'Unknown Cushion',
              brand: null,
              category: 'beauty',
              confidence: 0.69,
              evidence: 'compact shape only',
              searchQuery: '쿠션 팩트',
              source: 'vision',
            },
          ],
          sceneDescription: 'compact on a desk',
          uncertainty: 'brand unclear',
          policyUsed: 'mini-default',
          escalated: false,
        };
      },
    },
    transcriptTool: {
      async extract() {
        return {
          text: '이건 라네즈 네오 쿠션이에요.',
          source: 'provided_text',
          confidence: 0.95,
          warnings: [],
        };
      },
    },
    provider: {
      async generateObject(request) {
        generatedPrompts.push(request.userPrompt);
        return {
          object: {
            name: 'Laneige Neo Cushion',
            brand: 'Laneige',
            category: 'beauty',
            confidence: 0.76,
            evidence: 'transcript mentions laneige neo cushion',
            searchQuery: '라네즈 네오 쿠션',
            uncertainty: null,
          },
        };
      },
    },
    shoppingTool: {
      async search() {
        return [];
      },
    },
  });

  const result = await workflow.execute({
    context: {
      taskType: 'AUTO_PRODUCT_FROM_CLIP',
      channelCategory: 'beauty',
      clipContext: {
        clipId: 'clip-1',
        imageUrls: ['https://example.com/frame-1.jpg'],
        spokenText: '이건 라네즈 네오 쿠션이에요.',
      },
    },
  });

  assert.equal(result.selectedProduct.name, 'Laneige Neo Cushion');
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.recommendation, 'review_required');
  assert.ok(result.confidence < 0.78);
  assert.ok(result.verifier.reasons.includes('shopping_confirmation_missing'));
  assert.ok(result.verifier.reasons.includes('low_source_score_confidence'));
  assert.match(generatedPrompts[0], /Approved examples:/);
  assert.match(generatedPrompts[0], /Laneige Neo Cushion/);
});
