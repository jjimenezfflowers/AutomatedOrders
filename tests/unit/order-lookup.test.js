const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  OrderLookup,
  orderTokenFromUrl,
  normaliseCartToken,
  summarise,
} = require('../../lib/order-lookup');

function order({ name, cartToken = null, token = 'a'.repeat(32), titles = ['Roses'], createdAt = '2026-09-03T02:16:09Z' } = {}) {
  return {
    id: `gid://shopify/Order/${name}`,
    name,
    confirmationNumber: `CONF-${name}`,
    statusPageUrl: `https://shop.myshopify.com/637/orders/${token}`,
    createdAt,
    displayFinancialStatus: 'PAID',
    totalPriceSet: { shopMoney: { amount: '205.79', currencyCode: 'USD' } },
    lineItems: { nodes: titles.map((title) => ({ title, quantity: 1, variantTitle: '20 stems' })) },
    cartToken,
  };
}

/**
 * Stands in for ShopifyClient. `byCartToken` maps a search filter to its result,
 * `recent` is what the unfiltered list returns.
 */
function fakeClient({ byQuery = {}, recent = [] } = {}) {
  const asked = [];

  return {
    asked,
    async graphql(query, variables = {}) {
      if (query.includes('OrderById')) {
        asked.push(`id:${variables.id}`);
        return { order: recent.find((o) => o.id === variables.id) ?? null };
      }
      if (query.includes('FindOrder')) {
        asked.push(variables.query);
        return { orders: { nodes: byQuery[variables.query] ?? [] } };
      }
      asked.push(variables.query ?? '(all)');
      return { orders: { nodes: recent } };
    },
  };
}

describe('orderTokenFromUrl', () => {
  test('reads the token out of an order-status URL', () => {
    assert.equal(
      orderTokenFromUrl('https://shop.myshopify.com/63755223180/orders/40942b1e54627a5a836645762c94e852'),
      '40942b1e54627a5a836645762c94e852',
    );
  });

  test('ignores the key query string Shopify appends', () => {
    assert.equal(
      orderTokenFromUrl('https://shop.myshopify.com/637/orders/40942b1e54627a5a836645762c94e852?key=abc'),
      '40942b1e54627a5a836645762c94e852',
    );
  });

  test('is null for a URL with no token, rather than half a match', () => {
    assert.equal(orderTokenFromUrl('https://shop.myshopify.com/cart'), null);
    assert.equal(orderTokenFromUrl('https://shop.myshopify.com/orders/short'), null);
    assert.equal(orderTokenFromUrl(null), null);
    assert.equal(orderTokenFromUrl(''), null);
  });
});

describe('normaliseCartToken', () => {
  test('drops the read key /cart.js appends, which the order is not filed under', () => {
    assert.equal(
      normaliseCartToken('hWNGO8pyCVTkUGxB0qq58SCQ?key=3ad364720282ae995437db0320396a66'),
      'hWNGO8pyCVTkUGxB0qq58SCQ',
    );
  });

  test('leaves a bare token alone', () => {
    assert.equal(normaliseCartToken('hWNGO828YDgpYmSDFMKyD3Cs'), 'hWNGO828YDgpYmSDFMKyD3Cs');
  });

  test('is null for nothing, so a caller never searches for an empty token', () => {
    assert.equal(normaliseCartToken(null), null);
    assert.equal(normaliseCartToken(''), null);
    assert.equal(normaliseCartToken('   '), null);
    assert.equal(normaliseCartToken('?key=abc'), null);
  });
});

describe('summarise', () => {
  test('flattens an order into what the history file records', () => {
    assert.deepEqual(summarise(order({ name: 'DEV-BB-1' })), {
      id: 'gid://shopify/Order/DEV-BB-1',
      orderNumber: 'DEV-BB-1',
      confirmationNumber: 'CONF-DEV-BB-1',
      statusUrl: 'https://shop.myshopify.com/637/orders/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      createdAt: '2026-09-03T02:16:09Z',
      financialStatus: 'PAID',
      total: '205.79 USD',
      products: [{ title: 'Roses', quantity: 1, variant: '20 stems' }],
    });
  });

  test('is null for no order, so a caller cannot read fields off nothing', () => {
    assert.equal(summarise(null), null);
  });

  test('survives an order with no money or lines', () => {
    const bare = summarise({ id: 'gid://1', name: 'X' });

    assert.equal(bare.total, null);
    assert.deepEqual(bare.products, []);
  });
});

describe('findRunOrder', () => {
  test('prefers the cart token, and asks for it by filter', async () => {
    const wanted = order({ name: 'DEV-BB-WANTED' });
    const client = fakeClient({
      byQuery: { 'cart_token:hWNGO828YDgpYmSDFMKyD3Cs': [wanted] },
      recent: [order({ name: 'DEV-BB-OTHER' })],
    });

    const found = await new OrderLookup({ client }).findRunOrder({
      cartToken: 'hWNGO828YDgpYmSDFMKyD3Cs?key=abc',
    });

    assert.equal(found.orderNumber, 'DEV-BB-WANTED');
    assert.equal(found.matchedBy, 'cartToken');
    // The cart token identifies one order, so the list is never fetched.
    assert.deepEqual(client.asked, ['cart_token:hWNGO828YDgpYmSDFMKyD3Cs']);
  });

  test('refuses an ambiguous cart-token result rather than picking one', async () => {
    // Two hits means the filter did not identify one order. Falling through to a
    // slower match is honest; guessing between them is not.
    const client = fakeClient({
      byQuery: { 'cart_token:abc': [order({ name: 'A' }), order({ name: 'B' })] },
      recent: [order({ name: 'DEV-BB-RECENT' })],
    });

    const found = await new OrderLookup({ client }).findRunOrder({ cartToken: 'abc' });

    assert.equal(found.orderNumber, 'DEV-BB-RECENT');
    assert.notEqual(found.matchedBy, 'cartToken');
  });

  test('falls back to the order-status token when the cart token misses', async () => {
    const wanted = order({ name: 'DEV-BB-BYURL', token: 'b'.repeat(32) });
    const client = fakeClient({ recent: [order({ name: 'DEV-BB-NEWER' }), wanted] });

    const found = await new OrderLookup({ client }).findRunOrder({
      cartToken: 'nomatch',
      statusUrl: `https://shop.myshopify.com/637/orders/${'b'.repeat(32)}`,
    });

    assert.equal(found.orderNumber, 'DEV-BB-BYURL');
    assert.equal(found.matchedBy, 'orderStatusToken');
  });

  test('matches on products when no token is available', async () => {
    const client = fakeClient({
      recent: [
        order({ name: 'DEV-BB-TULIPS', titles: ['Tulips'] }),
        order({ name: 'DEV-BB-MINE', titles: ['Floreana White Spray Roses', 'Peach Sorbet'] }),
      ],
    });

    const found = await new OrderLookup({ client }).findRunOrder({
      productTitles: ['Floreana White Spray Roses', 'Peach Sorbet'],
    });

    assert.equal(found.orderNumber, 'DEV-BB-MINE');
    assert.equal(found.matchedBy, 'productsAndTime');
  });

  test('requires every product, so a run is not confused with an overlapping one', async () => {
    // An order holding one of the two products is somebody else's.
    const client = fakeClient({
      recent: [order({ name: 'DEV-BB-PARTIAL', titles: ['Roses'] })],
    });

    const found = await new OrderLookup({ client }).findRunOrder({
      productTitles: ['Roses', 'Peonies'],
    });

    assert.equal(found.matchedBy, 'mostRecent');
  });

  test('matches product titles case-insensitively and by substring', async () => {
    const client = fakeClient({
      recent: [order({ name: 'DEV-BB-CASE', titles: ['Floreana White Spray Roses - 20 stems'] })],
    });

    const found = await new OrderLookup({ client }).findRunOrder({
      productTitles: ['floreana white spray roses'],
    });

    assert.equal(found.matchedBy, 'productsAndTime');
  });

  test('reports how it matched, so a weak match is never read as a strong one', async () => {
    const client = fakeClient({ recent: [order({ name: 'DEV-BB-LAST' })] });

    const found = await new OrderLookup({ client }).findRunOrder({});

    assert.equal(found.matchedBy, 'mostRecent');
  });

  test('is null when the store has no recent orders at all', async () => {
    const client = fakeClient({ recent: [] });

    assert.equal(await new OrderLookup({ client }).findRunOrder({ productTitles: ['Roses'] }), null);
  });

  test('quotes the timestamp, which Shopify search requires', async () => {
    // Unquoted, the colons in the time parse as further filter separators and the
    // search silently matches nothing.
    const client = fakeClient({ recent: [order({ name: 'X' })] });

    await new OrderLookup({ client }).findRunOrder({ since: new Date('2026-09-03T02:00:00Z') });

    assert.equal(client.asked[0], "created_at:>='2026-09-03T02:00:00.000Z'");
  });
});

describe('orderById', () => {
  test('returns the summarised order', async () => {
    const wanted = order({ name: 'DEV-BB-BYID' });
    const client = fakeClient({ recent: [wanted] });

    const found = await new OrderLookup({ client }).orderById(wanted.id);

    assert.equal(found.orderNumber, 'DEV-BB-BYID');
    assert.equal(found.total, '205.79 USD');
  });

  test('is null for an id the store does not know', async () => {
    const client = fakeClient({ recent: [] });

    assert.equal(await new OrderLookup({ client }).orderById('gid://shopify/Order/0'), null);
  });
});
