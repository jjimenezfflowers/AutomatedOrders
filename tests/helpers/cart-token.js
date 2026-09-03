/*
 * The storefront cart token, which is what lets a run find its own order later.
 *
 * /cart.js is the documented Ajax API and returns the token the Admin API files
 * the order under as `cart_token`. That makes it the one identifier available in
 * the browser that maps to an order exactly.
 *
 * The page's `serialized-sourceToken` meta looks like a candidate and is not one:
 * on the run that produced DEV-BB-50F5472 the page showed hWNGO7ok… while the
 * order was filed under hWNGO828…. The shared prefix belongs to the store, not the
 * session, so the two look related and are not.
 */

/**
 * Reads the cart token from the page's own session. Returns null rather than
 * throwing: a run that cannot read its cart token should still place the order and
 * fall back to a coarser way of finding it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string|null>} e.g. "hWNGO8pyCVTkUGxB0qq58SCQ?key=3ad3647…"
 */
async function readCartToken(page) {
  try {
    const cart = await page.evaluate(() =>
      fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((response) =>
        response.ok ? response.json() : null,
      ),
    );

    // An empty cart carries a placeholder token that no order is ever filed
    // under, so it is worse than none — it would send the lookup off after a
    // token that cannot match.
    if (!cart?.token || cart.item_count === 0) return null;

    return cart.token;
  } catch {
    return null;
  }
}

module.exports = { readCartToken };
