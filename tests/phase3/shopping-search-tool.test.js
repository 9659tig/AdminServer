const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTestEnv } = require('../phase0/helpers/testEnv');

test('ShoppingSearchTool signs the Coupang request and normalizes ranked shopping results', async () => {
  applyTestEnv();

  const { ShoppingSearchTool } = require('../../dist/agent/tools/ShoppingSearchTool.js');

  const requests = [];
  const tool = new ShoppingSearchTool({
    apiBaseUrl: 'https://api.example.com',
    async hmacGenerator(method, path) {
      assert.equal(method, 'GET');
      assert.match(path, /keyword=%EB%9D%BC%EB%84%A4%EC%A6%88/);
      return 'signed-auth-header';
    },
    async fetchImpl(url, init) {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: {
              productData: [
                {
                  productName: '라네즈 네오 쿠션',
                  productUrl: 'https://www.coupang.com/vp/products/2',
                  productUrlMobile: 'https://link.coupang.com/a/2',
                  salePrice: 32000,
                  reviewCount: 80,
                  productImage: 'https://example.com/2.jpg',
                },
                {
                  productName: '라네즈 네오 쿠션 본품',
                  productUrl: 'https://www.coupang.com/vp/products/1',
                  productUrlMobile: 'https://link.coupang.com/a/1',
                  salePrice: 29000,
                  reviewCount: 150,
                  productImage: 'https://example.com/1.jpg',
                },
              ],
            },
          };
        },
      };
    },
  });

  const results = await tool.search('라네즈 네오 쿠션', 5);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Authorization, 'signed-auth-header');
  assert.equal(results.length, 2);
  assert.equal(results[0].reviewCount, 150);
  assert.equal(results[0].productName, '라네즈 네오 쿠션 본품');
  assert.equal(results[0].source, 'coupang');
});
