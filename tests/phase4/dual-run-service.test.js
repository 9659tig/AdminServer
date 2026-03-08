const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('DualRunService stores dual-run evaluations, metrics, gold-set examples, and source scores', async () => {
  applyTestEnv();

  const { DualRunService } = require('../../dist/agent/evaluation/dualRunService.js');
  const { createInMemoryEvaluationStore } = require('../../dist/agent/evaluation/evaluationStore.js');
  const { createInMemoryGoldSetStore } = require('../../dist/agent/evaluation/goldSetStore.js');
  const { createInMemorySourceScoreStore } = require('../../dist/agent/evaluation/sourceScoreStore.js');

  let callCount = 0;
  const service = new DualRunService({
    workflow: {
      async execute() {
        callCount += 1;

        const variants = [
          { top: 'Laneige Neo Cushion', topCandidates: ['Laneige Neo Cushion', 'Hince Cushion', 'Espoir Cushion'], confidence: 0.82, matched: true },
          { top: 'Laneige Neo Cushion', topCandidates: ['Laneige Neo Cushion', 'Espoir Cushion', 'Hince Cushion'], confidence: 0.79, matched: true },
          { top: 'Hince Cushion', topCandidates: ['Hince Cushion', 'Laneige Neo Cushion', 'Espoir Cushion'], confidence: 0.73, matched: false },
        ];

        const current = variants[callCount - 1];
        return {
          status: 'READY_FOR_REVIEW',
          recommendation: 'approve_candidate',
          confidence: current.confidence,
          selectedProduct: {
            name: current.top,
            brand: current.top.includes('Laneige') ? 'Laneige' : 'Hince',
            category: 'beauty',
            confidence: current.confidence,
            evidence: 'mock evidence',
            searchQuery: current.top,
            source: 'vision',
          },
          allCandidates: current.topCandidates.map((name, index) => ({
            name,
            brand: null,
            category: 'beauty',
            confidence: index === 0 ? current.confidence : 0.4,
            evidence: `candidate-${index + 1}`,
            searchQuery: name,
            source: 'vision',
          })),
          vision: {
            products: [],
            sceneDescription: 'compact shot',
            uncertainty: null,
            policyUsed: 'mini-default',
            escalated: false,
          },
          shoppingResults: [
            {
              source: 'coupang',
              productName: `${current.top} listing`,
              productUrl: `https://example.com/${callCount}`,
              reviewCount: 100 * callCount,
              rank: 1,
            },
          ],
          evidence: [
            { sourceType: 'vision', summary: 'logo visible' },
            { sourceType: 'shopping', summary: 'matching product found' },
          ],
          uncertainty: null,
          legacyComparison: {
            candidates: ['Laneige Neo Cushion'],
            overlap: current.matched ? ['Laneige Neo Cushion'] : [],
            matched: current.matched,
            selectedProduct: current.top,
          },
        };
      },
    },
    evaluationStore: createInMemoryEvaluationStore(),
    goldSetStore: createInMemoryGoldSetStore(),
    sourceScoreStore: createInMemorySourceScoreStore(),
  });

  const record = await service.run({
    input: {
      taskType: 'AUTO_PRODUCT_FROM_CLIP',
      channelCategory: 'beauty',
      clipContext: {
        clipId: 'clip-1',
        imageUrls: ['https://example.com/frame-1.jpg'],
      },
      legacyCandidates: ['Laneige Neo Cushion'],
    },
    goldLabel: 'Laneige Neo Cushion',
    iterations: 3,
    evaluationName: 'phase4-dual-run',
  });

  assert.equal(record.iterations.length, 3);
  assert.equal(record.metrics.taskSuccessRate, 1);
  assert.equal(record.metrics.failureRate, 0);
  assert.equal(record.metrics.top1MatchRate, 0.67);
  assert.equal(record.metrics.top3MatchRate, 1);
  assert.equal(record.metrics.consistencyScore, 1);
  assert.equal(record.metrics.evidenceCoverageScore, 0.5);

  const summary = await service.getSummary();
  assert.equal(summary.totalEvaluations, 1);
  assert.equal(summary.goldSetSize, 1);
  assert.equal(summary.avgTop1MatchRate, 0.67);
  assert.equal(summary.sourceScores.length, 2);
  assert.equal(summary.sourceScores[0].averageScore, 0.67);
});
