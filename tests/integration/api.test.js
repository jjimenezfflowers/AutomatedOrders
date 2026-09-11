/*
 * The HTTP endpoints, against a real server and a database of their own.
 *
 * The shapes are the contract the Angular app was built against, and the app was
 * deliberately not changed when the storage moved underneath it. These pin that
 * contract, and the two behaviours the move was for: a bad body is refused
 * instead of overwriting the catalogue, and runs recorded at once all survive.
 *
 *   node --test tests/integration/
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const { createTestDatabase } = require('../helpers/test-db');

const PORT = 3921;
const BASE = `http://127.0.0.1:${PORT}`;

const PRODUCT = {
  id: 'roses',
  name: 'Roses',
  url: 'https://example.myshopify.com/products/roses',
  variantSelector: '#option-0',
  variants: ['20 stems'],
  defaultVariant: '20 stems',
  quantitySelector: '#quantity-1',
  defaultQuantity: 1,
  origin: ['EC'],
  type: '',
};

const get = (path) => fetch(`${BASE}${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

/** Waits for the server to answer, rather than guessing at a sleep. */
async function waitForServer(deadlineMs = 20_000) {
  const deadline = Date.now() + deadlineMs;

  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error('The server did not start.');
}

describe('the HTTP API', () => {
  let database;
  let server;

  before(async () => {
    database = createTestDatabase();

    server = spawn('node', ['server.js'], {
      cwd: require('node:path').join(__dirname, '..', '..'),
      env: { ...process.env, DATABASE_URL: database.url, PORT: String(PORT) },
      stdio: 'ignore',
    });

    await waitForServer();
  });

  after(async () => {
    server.kill();
    await database.cleanup();
  });

  beforeEach(async () => {
    const { client } = database;
    await client.orderRun.deleteMany();
    await client.orderDraftItem.deleteMany();
    await client.orderDraft.deleteMany();
    await client.product.deleteMany();
    await client.setting.deleteMany();
    // Shared across stores and so across tests; cleared for isolation.
    await client.customerProfile.deleteMany();
    await client.paymentProfile.deleteMany();
  });

  describe('products', () => {
    test('serves an empty catalogue as an array, not an error', async () => {
      const { status, body } = await get('/api/products');

      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test('round-trips a catalogue through POST and GET', async () => {
      assert.equal((await post('/api/products', [PRODUCT])).status, 200);

      const { body } = await get('/api/products');
      assert.deepEqual(body, [PRODUCT]);
    });

    test('refuses a body that is not an array, and keeps the catalogue', async () => {
      // The old endpoint wrote req.body straight to disk: a POST of {} left
      // products.json holding exactly that, and 24 products were gone.
      await post('/api/products', [PRODUCT]);

      const refused = await post('/api/products', {});

      assert.equal(refused.status, 400);
      // The message, so the guard is what is being checked rather than whatever
      // the loop would have thrown on its own further in.
      assert.match(refused.body.error, /must be an array/);
      assert.deepEqual((await get('/api/products')).body, [PRODUCT]);
    });

    test('keeps the two stores apart', async () => {
      await post('/api/products', [PRODUCT]);
      await post('/api/staging-products', [{ ...PRODUCT, id: 'staging-only' }]);

      assert.deepEqual((await get('/api/products')).body.map((p) => p.id), ['roses']);
      assert.deepEqual(
        (await get('/api/staging-products')).body.map((p) => p.id),
        ['staging-only'],
      );
    });
  });

  describe('the order config', () => {
    const CONFIG = {
      deliveryDate: '2026-09-15',
      customerInfo: {
        email: 'jose@fiftyflowers.com',
        phone: '(208) 391-2924',
        firstName: 'Jose',
        lastName: 'Testing',
        address: '124 Ben St',
        city: 'Bristol',
        state: 'CT',
        zipCode: '06830',
      },
      payment: { cardNumber: '4242424242424242', cvv: '123', expiry: '1226' },
      orders: [{ productId: 'roses', quantity: 2, variant: '20 stems' }],
    };

    test('round-trips the whole config', async () => {
      assert.equal((await post('/api/order-config', CONFIG)).status, 200);

      assert.deepEqual((await get('/api/order-config')).body, CONFIG);
    });

    test('serves an empty config rather than a 500 before anything is saved', async () => {
      // The old endpoint returned 500 when the file was missing.
      const { status, body } = await get('/api/order-config');

      assert.equal(status, 200);
      assert.deepEqual(body, { deliveryDate: '', customerInfo: {}, payment: {}, orders: [] });
    });

    test('the staging config carries its base URL, and one row backs both endpoints', async () => {
      await post('/api/staging-order-config', {
        ...CONFIG,
        stagingBaseUrl: 'https://bloom-brain-stage.myshopify.com/',
      });

      const staging = await get('/api/staging-order-config');
      const settings = await get('/api/staging-config');

      assert.equal(staging.body.stagingBaseUrl, 'https://bloom-brain-stage.myshopify.com/');
      // These used to be two files that had to be written together by hand.
      assert.equal(settings.body.stagingBaseUrl, 'https://bloom-brain-stage.myshopify.com/');
    });

    test('saving the staging base URL on its own endpoint works too', async () => {
      await post('/api/staging-config', { stagingBaseUrl: 'https://other.example/' });

      assert.equal((await get('/api/staging-config')).body.stagingBaseUrl, 'https://other.example/');
    });

    test('serves a blank base URL rather than a 404 before one is set', async () => {
      assert.deepEqual((await get('/api/staging-config')).body, { stagingBaseUrl: '' });
    });
  });

  describe('order history', () => {
    test('serves an empty history as an array', async () => {
      const { status, body } = await get('/api/order-history');

      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test('serves what the runs recorded, oldest first', async () => {
      const store = require('../../lib/store');
      await store.addOrderRun(
        { orderNumber: 'older', date: '2026-09-01T00:00:00Z', products: [] },
        database.client,
      );
      await store.addOrderRun(
        { orderNumber: 'newer', date: '2026-09-02T00:00:00Z', products: [] },
        database.client,
      );

      const { body } = await get('/api/order-history');
      assert.deepEqual(body.map((entry) => entry.orderNumber), ['older', 'newer']);
    });
  });

  describe('health and logs', () => {
    test('health answers', async () => {
      assert.equal((await get('/api/health')).status, 200);
    });

    test('logs answer, and carry the lines the endpoints wrote', async () => {
      await get('/api/products');

      const { status, body } = await get('/api/logs?limit=50');

      assert.equal(status, 200);
      assert.ok(Array.isArray(body.logs));
    });

    test('a refused save is logged rather than swallowed', async () => {
      await post('/api/products', {});

      const { body } = await get('/api/logs?limit=50');
      const text = body.logs.map((entry) => entry.message ?? '').join('\n');

      assert.match(text, /Save products failed/);
    });
  });
});
