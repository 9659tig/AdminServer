const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('ProductExtractionWorkflow promotes transcript evidence when vision confidence is low and returns evidence-rich output', async () => {
  applyTestEnv();

  const { ProductExtractionWorkflow } = require('../../dist/agent/workflows/ProductExtractionWorkflow.js');

  const workflow = new ProductExtractionWorkflow({
    visionTool: {
      async identify() {
        return {
          products: [
            {
              name: 'Unknown Repair Serum',
              brand: null,
              category: 'skincare',
              confidence: 0.55,
              evidence: 'Brown bottle silhouette',
              searchQuery: '리페어 세럼',
              source: 'vision',
            },
          ],
          sceneDescription: 'A brown serum bottle on a vanity',
          uncertainty: 'label unreadable',
          policyUsed: 'mini-default',
          escalated: true,
        };
      },
    },
    transcriptTool: {
      async extract() {
        return {
          text: '저는 에스티로더 나이트 리페어를 매일 써요.',
          source: 'provided_text',
          confidence: 0.95,
          warnings: [],
        };
      },
    },
    provider: {
      async generateObject() {
        return {
          object: {
            name: 'Estee Lauder Advanced Night Repair',
            brand: 'Estee Lauder',
            category: 'skincare',
            confidence: 0.88,
            evidence: 'Transcript explicitly mentions Night Repair',
            searchQuery: '에스티로더 어드밴스드 나이트 리페어',
            uncertainty: null,
          },
        };
      },
    },
    shoppingTool: {
      async search(query) {
        assert.equal(query, '에스티로더 어드밴스드 나이트 리페어');
        return [
          {
            source: 'coupang',
            productName: '에스티로더 어드밴스드 나이트 리페어 50ml',
            productUrl: 'https://www.coupang.com/vp/products/1',
            deepLink: 'https://link.coupang.com/a/1',
            price: 128000,
            currency: 'KRW',
            reviewCount: 1200,
            rank: 1,
          },
        ];
      },
    },
  });

  const result = await workflow.execute({
    context: {
      taskType: 'AUTO_PRODUCT_FROM_CLIP',
      sourceType: 'clip',
      channelCategory: 'beauty',
      videoUrl: 'https://www.youtube.com/watch?v=phase3',
      clipContext: {
        clipId: 'clip-1',
        imageUrls: ['https://example.com/serum-1.jpg'],
        spokenText: '저는 에스티로더 나이트 리페어를 매일 써요.',
        channelName: 'phase3-channel',
        videoTitle: 'night routine',
      },
      legacyCandidates: ['Estee Lauder Advanced Night Repair', 'SK-II Pitera'],
    },
  });

  assert.equal(result.status, 'READY_FOR_REVIEW');
  assert.equal(result.recommendation, 'approve_candidate');
  assert.equal(result.selectedProduct.name, 'Estee Lauder Advanced Night Repair');
  assert.equal(result.selectedProduct.source, 'transcript');
  assert.equal(result.shoppingResults.length, 1);
  assert.ok(result.confidence >= 0.7);
  assert.equal(result.legacyComparison.matched, true);
  assert.deepEqual(
    result.evidence.map((entry) => entry.sourceType),
    ['vision', 'transcript', 'shopping', 'legacy'],
  );
});
