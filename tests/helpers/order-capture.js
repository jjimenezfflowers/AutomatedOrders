/*
 * Records what the store actually created, preferring the Admin API over the
 * confirmation page.
 *
 * Reading the page was never reliable: it produced 55 history entries whose order
 * number was page furniture ("Finalize order", "Order summary"), one that was the
 * hex colour #303030, and a total of 'N/A' on every entry ever written, because a
 * closed browser cannot be asked for one. Shopify also generates the checkout's
 * class names, so the selectors that work today are not promised to work tomorrow.
 *
 * The page is kept as a fallback rather than removed. Without credentials the tool
 * still has to place orders and still has to say what it placed, and a scraped
 * number is better than nothing — as long as its provenance is recorded, which is
 * what `source` is for.
 */

const { extractOrderNumber } = require('./order-number');
const { cartTokenFromCheckoutUrl, normaliseCartToken } = require('../../lib/order-lookup');

/*
 * Most specific first. `span:has-text("#")` matches any span containing a hash,
 * including one holding a hex colour, so it goes last — a real run captured
 * "#303030" from it and stopped before reaching .notice__text, which is where
 * "Your order number is: DEV-BB-…" actually lives.
 */
const ORDER_NUMBER_SELECTORS = [
  'span.os-order-number',
  '.order-number',
  '[data-order-number]',
  '.notice__text',
  'h2:has-text("Order")',
  'span:has-text("#")',
];

/** Reads the order number out of the confirmation page, or null. */
async function readOrderNumberFromPage(page) {
  for (const selector of ORDER_NUMBER_SELECTORS) {
    try {
      const text = await page.locator(selector).first().textContent({ timeout: 3000 });
      // These selectors also match headings like "Order summary", so keep looking
      // until one yields something shaped like an order number.
      const orderNumber = extractOrderNumber(text);
      if (orderNumber) return orderNumber;
    } catch {
      continue;
    }
  }

  try {
    return extractOrderNumber(await page.textContent('body'));
  } catch {
    return null;
  }
}

/**
 * Identifier-shaped tokens on the page, for when nothing was captured at all.
 *
 * Only tokens SHAPED like an identifier, never page prose. The confirmation page
 * carries the customer's address and email, and these logs land in the buffer
 * served by /api/logs, which has no auth and listens on 0.0.0.0 — so a snippet of
 * surrounding text would publish PII to anyone on the network.
 *
 * Emails are removed before matching rather than filtered afterwards. The pattern
 * cannot emit a token containing an @ or a dot, so filtering on those never drops
 * anything; what it misses is the fragment an address leaves behind, since
 * JOSE-TEST@FIFTY-FLOWERS.COM yields "JOSE-TEST" — identifier-shaped, and somebody's
 * name.
 */
async function identifierCandidates(page) {
  try {
    const text = ((await page.textContent('body')) ?? '').replace(/[^\s@]+@[^\s@]+/g, ' ');

    return [
      ...new Set(
        (text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b|#\s*\d{3,}\b/g) ?? []).map((token) =>
          token.trim(),
        ),
      ),
    ].slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * What the run placed, asked of the store first and the page second.
 *
 * @param {object} options
 * @param {import('@playwright/test').Page} options.page
 * @param {object} [options.lookup] an OrderLookup; omit to skip the API entirely
 * @param {string} [options.correlationId] the id this run stamped on its cart
 * @param {string} [options.cartToken] from /cart.js
 * @param {string} [options.checkoutUrl] the checkout URL, which carries the token
 * @param {Date} [options.since] when the run started
 * @param {string[]} [options.productTitles] what the run ordered
 * @param {number} [options.timeoutMs] how long to wait for the order to appear
 * @param {Function} [options.log]
 * @returns {Promise<object>} always resolves; `source` says where it came from
 */
async function captureOrder({
  page,
  lookup,
  correlationId,
  cartToken,
  checkoutUrl,
  since,
  productTitles = [],
  timeoutMs = 30_000,
  intervalMs = 3_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  // page.url() is synchronous, and throws outright once the page has closed.
  let statusUrl = null;
  try {
    statusUrl = page.url();
  } catch {
    statusUrl = null;
  }

  // The checkout URL carries the cart token for the whole of checkout, so it is
  // the steadier of the two sources; /cart.js needs the storefront session.
  const token = normaliseCartToken(cartToken) ?? cartTokenFromCheckoutUrl(checkoutUrl) ?? cartTokenFromCheckoutUrl(statusUrl);

  if (lookup) {
    /*
     * Shopify creates the order after the browser is redirected, so asking once
     * races it: a real run reached this point 5s early, found nothing, and
     * recorded an order it had genuinely placed as uncaptured. Retry until the
     * store has it.
     *
     * A `mostRecent` match is not accepted while there is still time to get a
     * real one — it is the guess of last resort, and during the window where the
     * run's own order has not appeared yet, the most recent order is somebody
     * else's.
     */
    const deadline = Date.now() + timeoutMs;
    let attempts = 0;

    while (true) {
      attempts += 1;

      try {
        const order = await lookup.findRunOrder({
          correlationId,
          cartToken: token,
          statusUrl,
          since,
          productTitles,
        });

        const strong = order?.orderNumber && order.matchedBy !== 'mostRecent';
        if (strong || (order?.orderNumber && Date.now() >= deadline)) {
          log(`🧾 Order ${order.orderNumber} (confirmation ${order.confirmationNumber ?? '—'}) via ${order.matchedBy}`);
          return { ...order, source: 'api' };
        }
      } catch (error) {
        // A credentials or network problem must not fail a run that placed a real
        // order — the order exists either way, and losing its number is the thing
        // this module is here to prevent.
        log(`⚠️  Could not reach the Shopify Admin API (${error.message}); falling back to the page`);
        break;
      }

      if (Date.now() >= deadline) {
        log(`⚠️  The store had no order for this run after ${attempts} attempts; falling back to the page`);
        break;
      }

      await sleep(intervalMs);
    }
  }

  const orderNumber = await readOrderNumberFromPage(page);

  if (!orderNumber) {
    log('⚠️  Could not capture a valid order number; recording the order without one');
    const candidates = await identifierCandidates(page);
    log(
      candidates.length
        ? `🔎 Identifier-shaped tokens on the confirmation page: ${candidates.join(', ')}`
        : '🔎 No identifier-shaped token found on the confirmation page at all',
    );
  }

  return {
    orderNumber: orderNumber ?? null,
    confirmationNumber: null,
    id: null,
    total: null,
    statusUrl,
    matchedBy: orderNumber ? 'pageText' : null,
    source: 'page',
  };
}

module.exports = {
  captureOrder,
  readOrderNumberFromPage,
  identifierCandidates,
  ORDER_NUMBER_SELECTORS,
};
