const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');
const { waitFor } = require('../phase1/helpers/waitFor');

test('reviewTask creates separate GoldSet entries for each approved candidate', async () => {
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
                    confidence: 0.95,
                    selectedProduct: { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.9, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                    allCandidates: [
                        { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.9, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                        { name: 'Nike Shox', brand: 'Nike', category: 'shoes', confidence: 0.85, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                        { name: 'Wide-leg pants', brand: null, category: 'pants', confidence: 0.7, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                    ],
                    candidateResults: [
                        {
                            candidate: { name: 'Nike Air Force 1', brand: 'Nike', category: 'shoes', confidence: 0.9, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                            shoppingResults: [
                                { source: 'naver', productName: 'AF1 로우', productUrl: 'https://x/1', price: 120000, reviewCount: 10, rank: 1 },
                                { source: 'naver', productName: 'AF1 하이', productUrl: 'https://x/2', price: 140000, reviewCount: 5, rank: 2 },
                            ],
                            evidence: [{ sourceType: 'vision', summary: 'sneakers' }, { sourceType: 'shopping', summary: '2 results' }],
                            confidence: 0.95,
                            verifier: { status: 'READY_FOR_REVIEW', recommendation: 'approve_candidate', adjustedConfidence: 0.95, reasons: [], sourceScoreSnapshot: [] },
                        },
                        {
                            candidate: { name: 'Nike Shox', brand: 'Nike', category: 'shoes', confidence: 0.85, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                            shoppingResults: [
                                { source: 'naver', productName: 'Shox TL', productUrl: 'https://x/3', price: 189000, reviewCount: 8, rank: 1 },
                            ],
                            evidence: [{ sourceType: 'vision', summary: 'sneakers' }, { sourceType: 'shopping', summary: '1 result' }],
                            confidence: 0.9,
                            verifier: { status: 'READY_FOR_REVIEW', recommendation: 'approve_candidate', adjustedConfidence: 0.9, reasons: [], sourceScoreSnapshot: [] },
                        },
                        {
                            candidate: { name: 'Wide-leg pants', brand: null, category: 'pants', confidence: 0.7, evidence: 'visible', searchQuery: 'q', source: 'vision' },
                            shoppingResults: [],
                            evidence: [{ sourceType: 'vision', summary: 'pants' }],
                            confidence: 0.55,
                            verifier: { status: 'NEEDS_REVIEW', recommendation: 'review_required', adjustedConfidence: 0.55, reasons: ['shopping_confirmation_missing'], sourceScoreSnapshot: [] },
                        },
                    ],
                    vision: { products: [], sceneDescription: '', uncertainty: null, policyUsed: 'mini-default', escalated: false },
                    shoppingResults: [
                        { source: 'naver', productName: 'AF1 로우', productUrl: 'https://x/1', price: 120000, reviewCount: 10, rank: 1 },
                    ],
                    evidence: [{ sourceType: 'vision', summary: 'sneakers' }, { sourceType: 'shopping', summary: '2 results' }],
                    uncertainty: null,
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
        channelCategory: 'fashion',
        clipContext: { imageUrls: ['https://example.com/img.jpg'] },
    });

    await waitFor(async () => {
        const d = await orchestrator.getTaskDetails(taskId);
        return d && d.task.status === 'NEEDS_REVIEW' ? d : undefined;
    });

    // 후보 0과 1을 승인 (각각 쇼핑 rank 1 선택)
    await orchestrator.reviewTask(taskId, {
        action: 'approve',
        approved: [
            { candidateIndex: 0, shoppingRank: 1 },
            { candidateIndex: 1, shoppingRank: 1 },
        ],
    });

    const examples = await goldSetStore.list();
    assert.equal(examples.length, 2, 'Should create 2 GoldSet entries');
    assert.equal(examples[0].expectedProduct, 'Nike Air Force 1');
    assert.equal(examples[1].expectedProduct, 'Nike Shox');
});
