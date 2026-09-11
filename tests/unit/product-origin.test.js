const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../../lib/store');
const { disconnect } = require('../../lib/db');

const ALLOWED_ORIGINS = new Set(['US', 'CO', 'EC']);

after(async () => {
  await disconnect();
});

function productById(products, id) {
  return products.find((product) => product.id === id);
}

describe('dev product origins', () => {
  test('every configured product has a valid origin for the Orders screen', async () => {
    const products = await store.getProducts('dev');

    for (const product of products) {
      const origins = product.origin;

      assert.ok(origins.length > 0, `${product.id} is missing origin`);
      for (const origin of origins) {
        assert.ok(ALLOWED_ORIGINS.has(origin), `${product.id} has unsupported origin ${origin}`);
      }
    }
  });

  test("Baby's Breath keeps its origin metadata", async () => {
    const products = await store.getProducts('dev');

    assert.deepEqual(productById(products, 'babys-breath-flower-new-love-3')?.origin, ['US', 'EC']);
  });

  test('the 200 Roses and 300 Carnations kit is marked as Ecuador origin', async () => {
    const products = await store.getProducts('dev');

    assert.deepEqual(productById(products, 'wedding-flower-kit')?.origin, ['EC']);
  });
});
