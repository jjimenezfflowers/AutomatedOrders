const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { readCheckoutError } = require('../helpers/checkout');

// Minimal stand-in for a Playwright page: locator().first().textContent().
function fakePage(textContent) {
  return {
    locator: () => ({
      first: () => ({
        textContent: () =>
          typeof textContent === 'function' ? textContent() : Promise.resolve(textContent),
      }),
    }),
  };
}

describe('readCheckoutError', () => {
  describe('regression: a detected error must reach the caller', () => {
    // Bug: the `throw new Error('Checkout error detected')` sat inside the same
    // try whose catch logged "Could not check for errors, browser may have
    // closed". A declined card therefore exited 0 and the UI reported success.
    test('returns the error text for a declined card', async () => {
      const page = fakePage('Your card was declined');

      assert.equal(await readCheckoutError(page), 'Your card was declined');
    });

    test('returns the text for a generic failure', async () => {
      const page = fakePage('Payment failed, please try again');

      assert.equal(await readCheckoutError(page), 'Payment failed, please try again');
    });

    test('never throws, so the caller controls failure', async () => {
      const exploding = fakePage(() => Promise.reject(new Error('Target page closed')));

      await assert.doesNotReject(() => readCheckoutError(exploding));
      assert.equal(await readCheckoutError(exploding), null);
    });
  });

  describe('known-benign notices stay ignored', () => {
    test('ignores Shopify rate limiting', async () => {
      const page = fakePage('There was a problem with our checkout. Please try again.');

      assert.equal(await readCheckoutError(page), null);
    });
  });

  describe('clean page', () => {
    test('returns null when nothing matches', async () => {
      assert.equal(await readCheckoutError(fakePage(null)), null);
    });

    test('returns null when the locator throws synchronously', async () => {
      const page = {
        locator: () => {
          throw new Error('page has been closed');
        },
      };

      assert.equal(await readCheckoutError(page), null);
    });
  });
});
