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
