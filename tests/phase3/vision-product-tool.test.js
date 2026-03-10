const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('VisionProductTool escalates from mini to 4o when confidence is below threshold', async () => {
  applyTestEnv();

  const { VisionProductTool } = require('../../dist/agent/tools/VisionProductTool.js');

  const requests = [];
  const tool = new VisionProductTool({
    provider: {
      async generateObject(request) {
        requests.push(request);

        if (request.policy === 'mini-default') {
          return {
            object: {
              products: [
                {
                  name: 'Unknown Cushion',
                  brand: null,
                  category: 'beauty',
                  confidence: 0.54,
                  evidence: 'Round compact visible',
                  searchQuery: '쿠션 팩트',
                },
              ],
              sceneDescription: 'Makeup pouch scene',
              uncertainty: 'brand unclear',
            },
          };
        }

        return {
          object: {
            products: [
              {
                name: 'Laneige Neo Cushion',
                brand: 'Laneige',
                category: 'beauty',
                confidence: 0.86,
                evidence: 'Laneige logo visible on the compact',
                searchQuery: '라네즈 네오 쿠션',
              },
            ],
            sceneDescription: 'Close-up of a blue compact',
            uncertainty: null,
          },
        };
      },
    },
  });

  const result = await tool.identify({
    imageUrls: ['https://example.com/frame-1.jpg', 'https://example.com/frame-2.jpg'],
    channelCategory: 'beauty',
    channelName: 'phase3-channel',
    videoTitle: 'best cushion review',
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].policy, 'mini-default');
  assert.equal(requests[1].policy, '4o-escalation');
  assert.equal(result.policyUsed, '4o-escalation');
  assert.equal(result.escalated, true);
  assert.equal(result.products[0].name, 'Laneige Neo Cushion');
  assert.equal(result.products[0].source, 'vision');

  const userMessage = requests[0].messages[1];
  assert.equal(userMessage.role, 'user');
  assert.equal(userMessage.content[1].type, 'image_url');
  assert.equal(userMessage.content[1].image_url.url, 'https://example.com/frame-1.jpg');
});
