const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { captureOrder, readOrderNumberFromPage, identifierCandidates } = require('../helpers/order-capture');

/**
 * Stands in for a Playwright page. `selectors` maps a selector to the text its
 * first match holds; `body` is the whole page's text.
 */
function fakePage({ selectors = {}, body = '', url = 'https://shop.myshopify.com/637/orders/abc' } = {}) {
  return {
    url: () => url,
    locator: (selector) => ({
      first: () => ({
        async textContent() {
          if (!(selector in selectors)) throw new Error(`no match for ${selector}`);
          return selectors[selector];
        },
      }),
    }),
    async textContent() {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

const silent = () => {};

describe('readOrderNumberFromPage', () => {
  test('reads the number out of the notice text', async () => {
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: DEV-BB-50F2327' } });

    assert.equal(await readOrderNumberFromPage(page), 'DEV-BB-50F2327');
  });

  test('skips headings that match the selector but hold no number', async () => {
    // 'span:has-text("#")' matches a heading like "Order summary" too, so a reader
    // that stopped at the first match would record page furniture as the number.
    const page = fakePage({
      selectors: {
        'h2:has-text("Order")': 'Order summary',
        '.notice__text': 'Your order number is: DEV-BB-9',
      },
    });

    assert.equal(await readOrderNumberFromPage(page), 'DEV-BB-9');
  });

  test('never returns a hex colour, which a real run once recorded', async () => {
    const page = fakePage({ selectors: { 'span:has-text("#")': '#303030' }, body: '#303030' });

    assert.equal(await readOrderNumberFromPage(page), null);
  });

  test('falls back to the body when no selector matches', async () => {
    const page = fakePage({ body: 'Thank you. Your order number is: DEV-BB-77' });

    assert.equal(await readOrderNumberFromPage(page), 'DEV-BB-77');
  });

  test('is null rather than throwing when the page has closed', async () => {
    const page = fakePage({ body: new Error('page closed') });

    assert.equal(await readOrderNumberFromPage(page), null);
  });
});

describe('identifierCandidates', () => {
  test('reports identifier-shaped tokens only', async () => {
    const page = fakePage({ body: 'DEV-BB-50F5472 and ORDER-9 shipped' });

    assert.deepEqual(await identifierCandidates(page), ['DEV-BB-50F5472', 'ORDER-9']);
  });

  test('never reports contact details, which these logs must not publish', async () => {
    // These lines land in the buffer served by /api/logs, which has no auth and
    // listens on 0.0.0.0.
    const page = fakePage({ body: 'JOSE@FIFTYFLOWERS.COM 124 Ben St (208) 391-2924 DEV-BB-1' });

    assert.deepEqual(await identifierCandidates(page), ['DEV-BB-1']);
  });

  test('leaks no fragment of a hyphenated email address', async () => {
    // The pattern cannot emit a token holding an @, so filtering on one drops
    // nothing; the real risk is the name left behind once the address is split.
    const page = fakePage({ body: 'Contact JOSE-TEST@FIFTY-FLOWERS.COM about DEV-BB-1' });
    const candidates = await identifierCandidates(page);

    assert.deepEqual(candidates, ['DEV-BB-1']);
    assert.ok(!candidates.includes('JOSE-TEST'));
    assert.ok(!candidates.includes('FIFTY-FLOWERS'));
  });

  test('is an empty list when the page cannot be read', async () => {
    assert.deepEqual(await identifierCandidates(fakePage({ body: new Error('closed') })), []);
  });
});

describe('captureOrder', () => {
  const apiOrder = {
    id: 'gid://shopify/Order/1',
    orderNumber: 'DEV-BB-50F5472',
    confirmationNumber: 'JLIF0508C',
    total: '205.79 USD',
    statusUrl: 'https://shop.myshopify.com/637/orders/abc',
    matchedBy: 'cartToken',
  };

  test('prefers the store, and says so', async () => {
    const lookup = { findRunOrder: async () => apiOrder };
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: WRONG-1' } });

    const captured = await captureOrder({ page, lookup, log: silent });

    assert.equal(captured.orderNumber, 'DEV-BB-50F5472');
    assert.equal(captured.confirmationNumber, 'JLIF0508C');
    assert.equal(captured.total, '205.79 USD');
    assert.equal(captured.source, 'api');
  });

  test('passes the run\'s identifiers through to the lookup', async () => {
    let received;
    const lookup = { findRunOrder: async (options) => { received = options; return apiOrder; } };
    const since = new Date('2026-09-03T02:00:00Z');

    await captureOrder({
      page: fakePage({}),
      lookup,
      cartToken: 'hWNGO8?key=x',
      since,
      productTitles: ['Roses'],
      log: silent,
    });

    assert.equal(received.cartToken, 'hWNGO8?key=x');
    assert.equal(received.since, since);
    assert.deepEqual(received.productTitles, ['Roses']);
    assert.equal(received.statusUrl, 'https://shop.myshopify.com/637/orders/abc');
  });

  test('falls back to the page when the API is unreachable', async () => {
    // A credentials or network problem must not lose the number of an order that
    // was really placed — which is the whole reason the page reader is kept.
    const lookup = { findRunOrder: async () => { throw new Error('401'); } };
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: DEV-BB-8' } });

    const captured = await captureOrder({ page, lookup, log: silent });

    assert.equal(captured.orderNumber, 'DEV-BB-8');
    assert.equal(captured.source, 'page');
  });

  test('falls back when the store answers with an order carrying no number', async () => {
    // A match that cannot name the order is not a usable answer, and recording it
    // would report source 'api' for an entry with no order number in it.
    const lookup = { findRunOrder: async () => ({ id: 'gid://1', orderNumber: null }) };
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: DEV-BB-5' } });

    const captured = await captureOrder({ page, lookup, log: silent });

    assert.equal(captured.orderNumber, 'DEV-BB-5');
    assert.equal(captured.source, 'page');
  });

  test('falls back when the store simply has no matching order', async () => {
    const lookup = { findRunOrder: async () => null };
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: DEV-BB-8' } });

    assert.equal((await captureOrder({ page, lookup, log: silent })).source, 'page');
  });

  test('reads the page when no lookup is configured at all', async () => {
    const page = fakePage({ selectors: { '.notice__text': 'Your order number is: DEV-BB-3' } });

    const captured = await captureOrder({ page, log: silent });

    assert.equal(captured.orderNumber, 'DEV-BB-3');
    assert.equal(captured.source, 'page');
  });

  test('records a run it could not identify without failing it', async () => {
    const captured = await captureOrder({ page: fakePage({ body: 'Thank you!' }), log: silent });

    assert.equal(captured.orderNumber, null);
    assert.equal(captured.source, 'page');
    assert.equal(captured.matchedBy, null);
  });

  test('never reports an API number without provenance', async () => {
    const captured = await captureOrder({
      page: fakePage({}),
      lookup: { findRunOrder: async () => apiOrder },
      log: silent,
    });

    assert.equal(captured.matchedBy, 'cartToken');
    assert.equal(captured.source, 'api');
  });

  test('an API failure is logged, not swallowed', async () => {
    const lines = [];
    await captureOrder({
      page: fakePage({ body: 'Thank you!' }),
      lookup: { findRunOrder: async () => { throw new Error('boom'); } },
      log: (line) => lines.push(line),
    });

    assert.ok(lines.some((line) => line.includes('boom')));
  });
});
