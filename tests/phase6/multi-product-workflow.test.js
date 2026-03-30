const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('VisionProductTool returns more than 3 products when vision finds them', async () => {
    applyTestEnv();

    const { VisionProductTool } = require('../../dist/agent/tools/VisionProductTool.js');

    const fiveProducts = [
        { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.95, evidence: 'white sneakers visible', searchQuery: 'Nike Air Force 1 white' },
        { name: 'Nike Shox', brand: 'Nike', category: 'shoes', confidence: 0.88, evidence: 'red silver sneakers', searchQuery: 'Nike Shox red silver' },
        { name: 'Wide-leg pants', brand: null, category: 'pants', confidence: 0.75, evidence: 'grey pants visible', searchQuery: 'wide leg pants grey' },
        { name: 'Black hoodie', brand: null, category: 'tops', confidence: 0.7, evidence: 'black hoodie worn', searchQuery: 'black hoodie oversized' },
        { name: 'White socks', brand: null, category: 'accessories', confidence: 0.6, evidence: 'white socks visible', searchQuery: 'white crew socks' },
    ];

    const tool = new VisionProductTool({
        provider: {
            async generateObject() {
                return {
                    object: {
                        products: fiveProducts,
                        sceneDescription: 'Person showing multiple outfits',
                        uncertainty: null,
                    },
                };
            },
        },
    });

    const result = await tool.identify({
        imageUrls: ['https://example.com/frame-1.jpg'],
        channelCategory: 'fashion',
    });

    assert.equal(result.products.length, 5, 'Should return all 5 products without cap');
    assert.equal(result.products[0].name, 'Nike Air Force 1');
    assert.equal(result.products[4].name, 'White socks');
});

test('ProductExtractionWorkflow searches shopping for all candidates and builds candidateResults', async () => {
    applyTestEnv();

    const { ProductExtractionWorkflow } = require('../../dist/agent/workflows/ProductExtractionWorkflow.js');

    const shoppingQueries = [];
    const workflow = new ProductExtractionWorkflow({
        visionTool: {
            async identify() {
                return {
                    products: [
                        { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.9, evidence: 'white sneakers', searchQuery: 'Nike Air Force 1 white', source: 'vision' },
                        { name: 'Nike Shox', brand: 'Nike', category: 'shoes', confidence: 0.85, evidence: 'red sneakers', searchQuery: 'Nike Shox red', source: 'vision' },
                        { name: 'Wide-leg pants', brand: null, category: 'pants', confidence: 0.7, evidence: 'grey pants', searchQuery: 'wide leg pants grey', source: 'vision' },
                    ],
                    sceneDescription: 'Person in multiple outfits',
                    uncertainty: null,
                    policyUsed: 'mini-default',
                    escalated: false,
                };
            },
        },
        transcriptTool: {
            async extract() {
                return { text: '', source: 'unavailable', confidence: 0, warnings: ['no audio'] };
            },
        },
        shoppingTool: {
            async search(query) {
                shoppingQueries.push(query);
                return [
                    { source: 'naver', productName: `${query} 상품1`, productUrl: 'https://example.com/1', price: 100000, reviewCount: 10, rank: 1 },
                    { source: 'naver', productName: `${query} 상품2`, productUrl: 'https://example.com/2', price: 90000, reviewCount: 5, rank: 2 },
                ];
            },
        },
        verifier: {
            async verifySingle(cr) {
                return {
                    status: 'READY_FOR_REVIEW',
                    recommendation: 'approve_candidate',
                    adjustedConfidence: cr.confidence,
                    reasons: [],
                    sourceScoreSnapshot: [],
                };
            },
        },
        fewShotBuilder: {
            async buildForCategory() { return ''; },
        },
    });

    const result = await workflow.execute({ context: {
        sourceType: 'video',
        channelCategory: 'fashion',
        clipContext: { imageUrls: ['https://example.com/frame.jpg'] },
    }});

    // 모든 후보에 대해 쇼핑 검색이 실행되었는지
    assert.equal(shoppingQueries.length, 3);
    assert.ok(shoppingQueries.includes('Nike Air Force 1 white'));
    assert.ok(shoppingQueries.includes('Nike Shox red'));
    assert.ok(shoppingQueries.includes('wide leg pants grey'));

    // candidateResults 배열이 올바르게 구성되었는지
    assert.equal(result.candidateResults.length, 3);

    assert.equal(result.candidateResults[0].candidate.name, 'Nike Air Force 1');
    assert.equal(result.candidateResults[0].shoppingResults.length, 2);
    assert.equal(result.candidateResults[0].shoppingResults[0].productName, 'Nike Air Force 1 white 상품1');

    assert.equal(result.candidateResults[1].candidate.name, 'Nike Shox');
    assert.equal(result.candidateResults[1].shoppingResults.length, 2);

    assert.equal(result.candidateResults[2].candidate.name, 'Wide-leg pants');
    assert.equal(result.candidateResults[2].shoppingResults.length, 2);

    // 하위 호환: selectedProduct, shoppingResults, evidence는 candidateResults[0]과 동일
    assert.equal(result.selectedProduct.name, 'Nike Air Force 1');
    assert.deepEqual(result.shoppingResults, result.candidateResults[0].shoppingResults);
});

test('Candidates with confidence < 0.5 are excluded from shopping search', async () => {
    applyTestEnv();

    const { ProductExtractionWorkflow } = require('../../dist/agent/workflows/ProductExtractionWorkflow.js');

    const shoppingQueries = [];
    const workflow = new ProductExtractionWorkflow({
        visionTool: {
            async identify() {
                return {
                    products: [
                        { name: 'Clear product', brand: 'Brand', category: 'cat', confidence: 0.8, evidence: 'visible', searchQuery: 'clear query', source: 'vision' },
                        { name: 'Unclear product', brand: null, category: 'cat', confidence: 0.3, evidence: 'barely visible', searchQuery: 'unclear query', source: 'vision' },
                    ],
                    sceneDescription: 'scene',
                    uncertainty: null,
                    policyUsed: 'mini-default',
                    escalated: false,
                };
            },
        },
        transcriptTool: {
            async extract() { return { text: '', source: 'unavailable', confidence: 0, warnings: [] }; },
        },
        shoppingTool: {
            async search(query) {
                shoppingQueries.push(query);
                return [{ source: 'naver', productName: query, productUrl: 'https://x', rank: 1, reviewCount: 0 }];
            },
        },
        verifier: {
            async verifySingle(cr) {
                return { status: 'READY_FOR_REVIEW', recommendation: 'approve_candidate', adjustedConfidence: cr.confidence, reasons: [], sourceScoreSnapshot: [] };
            },
        },
        fewShotBuilder: { async buildForCategory() { return ''; } },
    });

    const result = await workflow.execute({ context: {
        sourceType: 'video',
        channelCategory: 'test',
        clipContext: { imageUrls: ['https://example.com/f.jpg'] },
    }});

    // confidence 0.3인 후보는 쇼핑 검색 제외
    assert.equal(shoppingQueries.length, 1);
    assert.equal(shoppingQueries[0], 'clear query');

    // candidateResults에는 confidence >= 0.5인 후보만 포함
    assert.equal(result.candidateResults.length, 1);
    assert.equal(result.candidateResults[0].candidate.name, 'Clear product');
});
