const { test, expect } = require('@playwright/test');
const { readCheckoutError } = require('./helpers/checkout');

// Integration coverage for the checkout-failure guard, against a real DOM but no
// storefront. Proves the guard both detects a failure and lets it fail the run.

function fixture(body) {
  return `data:text/html,${encodeURIComponent(`<!doctype html><html><body>${body}</body></html>`)}`;
}

test('detects a declined card on the confirmation page', async ({ page }) => {
  await page.goto(fixture('<h2>Checkout</h2><div class="notice">Your card was declined</div>'));

  expect(await readCheckoutError(page)).toContain('declined');
});

test('a detected error propagates instead of being swallowed', async ({ page }) => {
  await page.goto(fixture('<div>Payment failed, please try again</div>'));

  // Mirrors place-order.spec.js: read first, then throw outside any guard.
  const checkoutError = await readCheckoutError(page);

  expect(checkoutError).toBeTruthy();
  expect(() => {
    if (checkoutError) throw new Error(`Checkout error detected: ${checkoutError}`);
  }).toThrow(/Checkout error detected/);
});

test('ignores the Shopify rate-limiting notice', async ({ page }) => {
  await page.goto(fixture('<div>There was a problem with our checkout. Please try again.</div>'));

  expect(await readCheckoutError(page)).toBeNull();
});

test('returns null on a successful confirmation page', async ({ page }) => {
  await page.goto(fixture('<h2>Your order is confirmed</h2><p>Your order number is: DEV-BB-50F2327</p>'));

  expect(await readCheckoutError(page)).toBeNull();
});

test('detects the wordings Shopify uses for a rejected card', async ({ page }) => {
  const wordings = [
    'Your card was declined',
    'The payment could not be processed',
    'We are unable to process your payment',
    'There was a problem processing your payment',
  ];

  for (const wording of wordings) {
    await page.goto(fixture(`<div>${wording}</div>`));
    expect(await readCheckoutError(page), wording).toBeTruthy();
  }
});
