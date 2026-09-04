const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'products.json'), 'utf8'),
);

const ALLOWED_ORIGINS = new Set(['US', 'CO', 'EC']);

function normalizeOrigin(origin) {
  return Array.isArray(origin) ? origin : origin ? [origin] : [];
}

function productById(id) {
  return products.find((product) => product.id === id);
}

describe('dev product origins', () => {
  test('every configured product has a valid origin for the Orders screen', () => {
    for (const product of products) {
      const origins = normalizeOrigin(product.origin);

      assert.ok(origins.length > 0, `${product.id} is missing origin`);
      for (const origin of origins) {
        assert.ok(ALLOWED_ORIGINS.has(origin), `${product.id} has unsupported origin ${origin}`);
      }
    }
  });

  test("the same Baby's Breath product keeps origin on both selectable entries", () => {
    assert.deepEqual(productById('babys-breath-flower-new-love-3')?.origin, ['US', 'EC']);
    assert.deepEqual(productById('babys-breath-flower-new-love')?.origin, ['US', 'EC']);
  });

  test('the 200 Roses and 300 Carnations kit is marked as Ecuador origin', () => {
    assert.deepEqual(productById('wedding-flower-kit')?.origin, ['EC']);
  });
});
