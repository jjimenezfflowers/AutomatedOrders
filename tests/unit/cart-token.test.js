const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { readCartToken } = require('../helpers/cart-token');

/**
 * Minimal stand-in for a Playwright page. `cart` is what /cart.js answers;
 * passing an Error makes the fetch reject, as a closed page would.
 */
function fakePage(cart) {
  return {
    async evaluate(fn) {
      if (cart instanceof Error) throw cart;
      return fn === undefined ? null : cart;
    },
  };
}

describe('readCartToken', () => {
  test('returns the token of a cart holding something', async () => {
    const page = fakePage({ token: 'hWNGO8pyCVTkUGxB0qq58SCQ?key=abc', item_count: 1 });

    assert.equal(await readCartToken(page), 'hWNGO8pyCVTkUGxB0qq58SCQ?key=abc');
  });

  test('ignores an empty cart, whose token no order is ever filed under', async () => {
    // The placeholder an empty cart carries is worse than no token: it would send
    // the lookup after a value that cannot match, instead of falling back.
    const page = fakePage({ token: 'b50d60f5738ab8c3864558b2576c4b22', item_count: 0 });

    assert.equal(await readCartToken(page), null);
  });

  test('is null when the response carries no token', async () => {
    assert.equal(await readCartToken(fakePage({ item_count: 1 })), null);
    assert.equal(await readCartToken(fakePage(null)), null);
  });

  test('is null rather than throwing when the page is gone', async () => {
    // A run that cannot read its cart token must still place the order and record
    // it some other way, so this never becomes the reason a run fails.
    const page = fakePage(new Error('Target page, context or browser has been closed'));

    assert.equal(await readCartToken(page), null);
  });
});
