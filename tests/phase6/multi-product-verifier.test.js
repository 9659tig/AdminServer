const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('VerifierAgent.verifySingle verifies a single CandidateResult independently', async () => {
    applyTestEnv();

    const { VerifierAgent } = require('../../dist/agent/verifier/VerifierAgent.js');
    const { createInMemorySourceScoreStore } = require('../../dist/agent/evaluation/sourceScoreStore.js');

    const sourceScoreStore = createInMemorySourceScoreStore();
    const verifier = new VerifierAgent({ sourceScoreStore, approvalThreshold: 0.78 });

    // 후보 1: 쇼핑 결과 있음 → READY_FOR_REVIEW
    const result1 = await verifier.verifySingle({
        candidate: { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.9, evidence: 'visible', searchQuery: 'q', source: 'vision' },
        shoppingResults: [{ source: 'naver', productName: 'Air Force 1', productUrl: 'https://x', price: 120000, reviewCount: 10, rank: 1 }],
        evidence: [
            { sourceType: 'vision', summary: 'sneakers visible', confidence: 0.9 },
            { sourceType: 'shopping', summary: '1 result found' },
        ],
        confidence: 1.0,
    });
    assert.equal(result1.status, 'READY_FOR_REVIEW');

    // 후보 2: 쇼핑 결과 없음 → NEEDS_REVIEW (감점)
    const result2 = await verifier.verifySingle({
        candidate: { name: 'Wide-leg pants', brand: null, category: 'pants', confidence: 0.7, evidence: 'visible', searchQuery: 'q', source: 'vision' },
        shoppingResults: [],
        evidence: [
            { sourceType: 'vision', summary: 'pants visible', confidence: 0.7 },
        ],
        confidence: 0.7,
    });
    assert.equal(result2.status, 'NEEDS_REVIEW');
    assert.ok(result2.reasons.includes('shopping_confirmation_missing'));
});
