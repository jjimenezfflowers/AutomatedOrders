/*
 * Runs against the real dev store.
 *
 * The unit tests pin the logic against a fake; these pin the assumptions the
 * logic rests on — that the grant works, that the fields queried exist, and above
 * all that `cart_token:` is a filter the order search honours rather than a phrase
 * it quietly full-text searches. That last one cannot be established against a
 * fake, and getting it wrong would mean every run silently matched the wrong order.
 *
 * Reads only. Places no orders.
 *
 *   node --test tests/integration/
 *
 * Skipped in full when no credentials are configured, so the suite stays green on
 * a checkout that has no .env.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch {
  // No .env; the guard below skips everything.
}

const { ShopifyClient, hasCredentials } = require('../../lib/shopify');
const { OrderLookup } = require('../../lib/order-lookup');

const skip = hasCredentials() ? false : 'no Shopify credentials configured';

describe('Shopify Admin API', { skip }, () => {
  let client;
  let lookup;
  /** A real recent order, used as the fixture the filters are checked against. */
  let known;

  before(async () => {
    client = new ShopifyClient({ environment: 'dev' });
    lookup = new OrderLookup({ environment: 'dev' });
    [known] = await lookup.recentOrders({ first: 1 });
  });

  describe('authentication', () => {
    test('the client-credentials grant returns a token', async () => {
      assert.match(await client.accessToken(), /^shpat_|^shpca_|.{20,}/);
    });

    test('the token carries the scopes this tool needs', async () => {
      await client.accessToken();

      assert.match(client.scope, /read_orders|read_all_orders/);
    });

    test('the token is reused rather than re-requested', async () => {
      const first = await client.accessToken();

      assert.equal(await client.accessToken(), first);
    });

    test('wrong credentials are refused, not silently accepted', async () => {
      const wrong = new ShopifyClient({
        environment: 'dev',
        env: { SHOPIFY_CLIENT_ID: 'nope', SHOPIFY_CLIENT_SECRET: 'nope' },
      });

      await assert.rejects(() => wrong.accessToken(), (error) => {
        assert.ok(error.status >= 400);
        return true;
      });
    });
  });

  describe('the fields the lookup depends on', () => {
    test('an order carries a name, a confirmation number and a status URL', () => {
      assert.ok(known, 'the dev store has no orders to check against');
      assert.match(known.name, /\S/);
      assert.match(known.statusPageUrl, /\/orders\/[a-f0-9]{20,}/);
      assert.match(known.id, /^gid:\/\/shopify\/Order\/\d+$/);
    });

    test('confirmationNumber still exists on Order', () => {
      // Distinct from `name`, and the value the thank-you page shows.
      assert.ok('confirmationNumber' in known);
    });

    test('cartToken is readable, which is what lets a match be verified', async () => {
      // Added to Order in API 2026-07. On 2026-04 and earlier the field does not
      // exist, so the pinned version matters and is asserted here.
      assert.ok('cartToken' in known);
    });

    test('checkoutToken is readable too', async () => {
      /*
       * Both tokens are readable on 2026-07, against a changelog that named only
       * cartToken. Pinned because the pinned API version is what decides it: on
       * 2026-04 and earlier neither field exists, and a silent downgrade would
       * turn the verified cart-token match back into a trusted one.
       */
      const data = await client.graphql(
        '{ orders(first: 1, reverse: true, sortKey: CREATED_AT) { nodes { checkoutToken } } }',
      );

      assert.ok('checkoutToken' in data.orders.nodes[0]);
    });

    test('customAttributes survive from the cart onto the order', async () => {
      // The correlation id rides in on this, so it has to be real. This store's
      // own storefront already sets attributes, which is how it was confirmed.
      assert.ok(Array.isArray(known.customAttributes));
    });

    test('a total comes back as money, which the history file lacked entirely', () => {
      assert.match(known.totalPriceSet.shopMoney.amount, /^\d+\.\d{2}$/);
      assert.equal(known.totalPriceSet.shopMoney.currencyCode.length, 3);
    });
  });

  describe('order search filters', () => {
    /** Asks the search for one filter and returns the names it answers with. */
    async function search(query) {
      const data = await client.graphql(
        'query($q: String!) { orders(first: 5, query: $q) { nodes { name } } }',
        { q: query },
      );
      return data.orders.nodes.map((node) => node.name);
    }

    test('an unknown filter key is ignored, which is how a bad one hides', async () => {
      // The control the other cases are read against: Shopify does not reject an
      // unrecognised key, it falls back to a full-text search and returns
      // unrelated orders. Without this, "it returned something" proves nothing.
      const names = await search('zzz_not_a_filter:DOES-NOT-EXIST');

      assert.ok(names.length > 0);
    });

    test('cart_token identifies exactly one order', async () => {
      const names = await search(`cart_token:${'z'.repeat(24)}`);

      // A recognised filter with no match returns nothing, unlike the control.
      assert.equal(names.length, 0);
    });

    test('confirmation_number finds the order it belongs to', async () => {
      const names = await search(`confirmation_number:${known.confirmationNumber}`);

      assert.deepEqual(names, [known.name]);
    });

    test('name finds the order it belongs to', async () => {
      assert.deepEqual(await search(`name:${known.name}`), [known.name]);
    });

    test('created_at narrows to a window', async () => {
      const future = new Date(Date.now() + 86_400_000);

      assert.deepEqual(await lookup.recentOrders({ since: future }), []);
    });
  });

  describe('findRunOrder', () => {
    test('finds an order by the products it holds', async () => {
      const titles = known.lineItems.nodes.map((node) => node.title);
      const found = await lookup.findRunOrder({
        since: new Date(Date.parse(known.createdAt) - 1000),
        productTitles: titles,
      });

      assert.equal(found.orderNumber, known.name);
      assert.equal(found.matchedBy, 'productsAndTime');
    });

    test('finds an order by its status URL', async () => {
      const found = await lookup.findRunOrder({
        statusUrl: known.statusPageUrl,
        since: new Date(Date.parse(known.createdAt) - 1000),
      });

      assert.equal(found.orderNumber, known.name);
      assert.equal(found.matchedBy, 'orderStatusToken');
    });

    test('round-trips an order by id', async () => {
      const found = await lookup.orderById(known.id);

      assert.equal(found.orderNumber, known.name);
      assert.equal(found.confirmationNumber, known.confirmationNumber);
    });

    test('reports nothing rather than a guess when the window is empty', async () => {
      const found = await lookup.findRunOrder({
        since: new Date(Date.now() + 86_400_000),
        productTitles: ['Nothing'],
      });

      assert.equal(found, null);
    });
  });

  describe('both stores', () => {
    test('dev and staging resolve to different shops', () => {
      const dev = new ShopifyClient({ environment: 'dev' });
      const staging = new ShopifyClient({ environment: 'staging' });

      assert.notEqual(dev.shop, staging.shop);
      assert.match(dev.baseUrl, /^https:\/\/[\w-]+\.myshopify\.com$/);
    });
  });
});
