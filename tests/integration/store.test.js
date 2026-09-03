/*
 * The store against a real database.
 *
 * The unit tests pin the mapping between rows and JSON; these pin the behaviour
 * that mapping rests on — that a save is atomic, that children go with their
 * parents, and above all that two runs finishing together both survive. The last
 * one cannot be shown against a fake, and it is the reason the JSON files were
 * replaced: five concurrent runs left two entries.
 *
 *   node --test tests/integration/
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../../lib/store');
const { db } = require('../../lib/db');
const { createTestDatabase } = require('../helpers/test-db');

const PRODUCT = {
  id: 'floreana-white-spray-roses',
  name: 'Floreana White Spray Roses',
  url: 'https://example.myshopify.com/products/roses',
  variantSelector: '#option-0',
  variants: ['20 stems', '50 stems'],
  defaultVariant: '20 stems',
  quantitySelector: '#quantity-1',
  defaultQuantity: 1,
  origin: ['US', 'EC'],
  type: '',
};

const CUSTOMER = {
  email: 'jose@fiftyflowers.com',
  phone: '(208) 391-2924',
  firstName: 'Jose',
  lastName: 'Testing',
  address: '124 Ben St',
  city: 'Bristol',
  state: 'CT',
  zipCode: '06830',
};

const PAYMENT = { cardNumber: '4242424242424242', cvv: '123', expiry: '1226' };

describe('the store', () => {
  let database;
  let client;

  before(() => {
    database = createTestDatabase();
    client = database.client;
  });

  after(async () => {
    await database.cleanup();
  });

  beforeEach(async () => {
    await client.orderRun.deleteMany();
    await client.orderDraftItem.deleteMany();
    await client.orderDraft.deleteMany();
    await client.product.deleteMany();
    await client.setting.deleteMany();
    await client.customerProfile.deleteMany();
    await client.paymentProfile.deleteMany();
  });

  describe('products', () => {
    test('round-trips a product unchanged', async () => {
      await store.saveProducts('dev', [PRODUCT], client);

      assert.deepEqual(await store.getProducts('dev', client), [PRODUCT]);
    });

    test('keeps the catalogue in the order it was given', async () => {
      const second = { ...PRODUCT, id: 'eskimo-white-rose', name: 'Eskimo' };
      await store.saveProducts('dev', [second, PRODUCT], client);

      const names = (await store.getProducts('dev', client)).map((product) => product.id);
      assert.deepEqual(names, ['eskimo-white-rose', 'floreana-white-spray-roses']);
    });

    test('keeps the two stores apart', async () => {
      await store.saveProducts('dev', [PRODUCT], client);
      await store.saveProducts('staging', [{ ...PRODUCT, id: 'staging-only' }], client);

      assert.deepEqual(
        (await store.getProducts('dev', client)).map((p) => p.id),
        ['floreana-white-spray-roses'],
      );
      assert.deepEqual(
        (await store.getProducts('staging', client)).map((p) => p.id),
        ['staging-only'],
      );
    });

    test('round-trips option choices of both shapes', async () => {
      // The file mixed plain strings and priced objects inside one array.
      const withOptions = {
        ...PRODUCT,
        productOptions: [
          {
            id: 'vo_2_1383',
            label: 'Choose a colour',
            selector: '#form-item',
            options: ['White', { value: 'Cream', label: 'Cream Add $9.00', price: 9 }],
            defaultValue: 'White',
          },
        ],
      };

      await store.saveProducts('dev', [withOptions], client);

      assert.deepEqual(await store.getProducts('dev', client), [withOptions]);
    });

    test('accepts the string origin the file also used', async () => {
      await store.saveProducts('dev', [{ ...PRODUCT, origin: 'EC' }], client);

      // Normalised to a list, which the UI already accepted either way.
      assert.deepEqual((await store.getProducts('dev', client))[0].origin, ['EC']);
    });

    test('replacing the catalogue takes the children with it', async () => {
      await store.saveProducts('dev', [PRODUCT], client);
      await store.saveProducts('dev', [], client);

      assert.equal(await client.productVariant.count(), 0);
      assert.equal(await client.productOrigin.count(), 0);
    });

    test('refuses a body that is not an array', async () => {
      // A POST of {} used to leave products.json holding exactly that.
      await store.saveProducts('dev', [PRODUCT], client);

      /*
       * The message is asserted, not just the type. Without the guard the loop
       * still throws a TypeError of its own further in, so a test that only
       * checked the type would pass on an accident rather than on the check.
       */
      await assert.rejects(() => store.saveProducts('dev', {}, client), /must be an array/);

      assert.equal((await store.getProducts('dev', client)).length, 1);
    });

    test('leaves the catalogue alone when a save fails halfway', async () => {
      await store.saveProducts('dev', [PRODUCT], client);

      // The second product has no slug, which the column will not take.
      await assert.rejects(() =>
        store.saveProducts('dev', [{ ...PRODUCT, id: 'ok' }, { ...PRODUCT, id: null }], client),
      );

      const after = await store.getProducts('dev', client);
      assert.deepEqual(after, [PRODUCT]);
    });

    test('refuses an environment it does not know', async () => {
      await assert.rejects(() => store.getProducts('production', client), /production/);
    });
  });

  describe('the order draft', () => {
    test('round-trips a draft with its customer and card', async () => {
      const config = {
        deliveryDate: '2026-09-15',
        customerInfo: CUSTOMER,
        payment: PAYMENT,
        orders: [{ productId: 'roses', quantity: 2, variant: '20 stems' }],
      };

      await store.saveOrderConfig('dev', config, client);

      assert.deepEqual(await store.getOrderConfig('dev', client), config);
    });

    test('keeps the option selections a line carries', async () => {
      const config = {
        deliveryDate: '',
        customerInfo: CUSTOMER,
        payment: PAYMENT,
        orders: [
          {
            productId: 'wedding-flower-kit',
            quantity: 1,
            productOptions: { vo_0_1381: 'Bear Grass' },
          },
        ],
      };

      await store.saveOrderConfig('dev', config, client);

      const back = await store.getOrderConfig('dev', client);
      assert.deepEqual(back.orders[0].productOptions, { vo_0_1381: 'Bear Grass' });
    });

    test('shares the customer and the card across both stores', async () => {
      // The UI has one Customer Info page; two config files drifted apart.
      await store.saveOrderConfig(
        'dev',
        { customerInfo: CUSTOMER, payment: PAYMENT, orders: [] },
        client,
      );

      const staging = await store.getOrderConfig('staging', client);
      assert.deepEqual(staging.customerInfo, CUSTOMER);
      assert.deepEqual(staging.payment, PAYMENT);
    });

    test('carries the base URL on the staging draft only', async () => {
      await store.saveOrderConfig(
        'staging',
        { orders: [], stagingBaseUrl: 'https://bloom-brain-stage.myshopify.com/' },
        client,
      );

      const staging = await store.getOrderConfig('staging', client);
      const dev = await store.getOrderConfig('dev', client);

      assert.equal(staging.stagingBaseUrl, 'https://bloom-brain-stage.myshopify.com/');
      assert.ok(!('stagingBaseUrl' in dev));
      // One row now, rather than a second file kept in step by hand.
      assert.equal(await store.getStagingBaseUrl(client), 'https://bloom-brain-stage.myshopify.com/');
    });

    test('replaces the lines rather than appending to them', async () => {
      await store.saveOrderConfig('dev', { orders: [{ productId: 'a', quantity: 1 }] }, client);
      await store.saveOrderConfig('dev', { orders: [{ productId: 'b', quantity: 1 }] }, client);

      const back = await store.getOrderConfig('dev', client);
      assert.deepEqual(back.orders.map((order) => order.productId), ['b']);
    });

    test('reads back empty rather than throwing before anything is saved', async () => {
      assert.deepEqual(await store.getOrderConfig('dev', client), {
        deliveryDate: '',
        customerInfo: {},
        payment: {},
        orders: [],
      });
    });

    test('refuses a body that is not an object', async () => {
      await assert.rejects(() => store.saveOrderConfig('dev', null, client), /must be an object/);
    });
  });

  describe('order history', () => {
    const run = (overrides = {}) => ({
      orderNumber: 'DEV-BB-1',
      date: '2026-09-03T02:37:08.000Z',
      environment: 'dev',
      customer: CUSTOMER.email,
      products: [{ productId: 'roses', quantity: 1, variant: '20 stems' }],
      total: '114.86 USD',
      ...overrides,
    });

    test('records a run and reads it back', async () => {
      await store.addOrderRun(run(), client);

      const [entry] = await store.getOrderHistory(client);
      assert.equal(entry.orderNumber, 'DEV-BB-1');
      assert.equal(entry.total, '114.86 USD');
      assert.equal(entry.products[0].variant, '20 stems');
    });

    test('keeps every run when several finish at once', async () => {
      /*
       * The reason for this migration. Appending to the JSON file read the whole
       * history, pushed onto it and wrote it back, so five runs finishing
       * together left two entries: each had read the file before the others
       * wrote.
       */
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          store.addOrderRun(run({ orderNumber: `DEV-BB-${index}` }), client),
        ),
      );

      const history = await store.getOrderHistory(client);
      assert.equal(history.length, 5);
      assert.deepEqual(
        history.map((entry) => entry.orderNumber).sort(),
        ['DEV-BB-0', 'DEV-BB-1', 'DEV-BB-2', 'DEV-BB-3', 'DEV-BB-4'],
      );
    });

    test('reads oldest first, the order the file was written in', async () => {
      await store.addOrderRun(run({ orderNumber: 'older', date: '2026-09-01T00:00:00Z' }), client);
      await store.addOrderRun(run({ orderNumber: 'newer', date: '2026-09-02T00:00:00Z' }), client);

      assert.deepEqual(
        (await store.getOrderHistory(client)).map((entry) => entry.orderNumber),
        ['older', 'newer'],
      );
    });

    test('the latest run is the newest one, whatever order they were written in', async () => {
      await store.addOrderRun(run({ orderNumber: 'newer', date: '2026-09-02T00:00:00Z' }), client);
      await store.addOrderRun(run({ orderNumber: 'older', date: '2026-09-01T00:00:00Z' }), client);

      assert.equal((await store.getLatestOrderRun(client)).orderNumber, 'newer');
    });

    test('is null when nothing has run yet', async () => {
      assert.equal(await store.getLatestOrderRun(client), null);
    });

    test('keeps line items, tags and their order', async () => {
      await store.addOrderRun(
        run({
          tags: ['bb-16055', 'PRO10', 'Review Address'],
          lineItems: [
            { title: 'Roses', quantity: 1, sku: 'FF-1', unitPrice: '119.99 USD' },
            { title: 'Peonies', quantity: 2 },
          ],
        }),
        client,
      );

      const [entry] = await store.getOrderHistory(client);
      assert.deepEqual(entry.tags, ['bb-16055', 'PRO10', 'Review Address']);
      assert.deepEqual(entry.lineItems.map((item) => item.title), ['Roses', 'Peonies']);
    });

    test('keeps the option selections a run asked for', async () => {
      await store.addOrderRun(
        run({
          products: [
            { productId: 'wedding-flower-kit', quantity: 1, productOptions: { vo_0: 'Bear Grass' } },
          ],
        }),
        client,
      );

      const [entry] = await store.getOrderHistory(client);
      assert.deepEqual(entry.products[0].productOptions, { vo_0: 'Bear Grass' });
    });

    test("stores a missing total as absence and reads it as 'N/A'", async () => {
      await store.addOrderRun(run({ total: 'N/A' }), client);

      const stored = await client.orderRun.findFirst();
      assert.equal(stored.total, null);
      assert.equal((await store.getOrderHistory(client))[0].total, 'N/A');
    });

    test('records a run with no order number rather than refusing it', async () => {
      // The order was still placed; dropping the entry would hide it.
      await store.addOrderRun(run({ orderNumber: null }), client);

      assert.equal((await store.getOrderHistory(client)).length, 1);
    });

    test('refuses something that is not a run', async () => {
      await assert.rejects(() => store.addOrderRun(null, client), TypeError);
    });
  });

  describe('settings', () => {
    test('round-trips a value', async () => {
      await store.setSetting('stagingBaseUrl', 'https://example.com/', client);

      assert.equal(await store.getSetting('stagingBaseUrl', client), 'https://example.com/');
    });

    test('overwrites rather than duplicating', async () => {
      await store.setSetting('k', 'one', client);
      await store.setSetting('k', 'two', client);

      assert.equal(await store.getSetting('k', client), 'two');
      assert.equal(await client.setting.count(), 1);
    });

    test('is null for a key that was never set', async () => {
      assert.equal(await store.getSetting('nope', client), null);
    });
  });
});

describe('the committed database', () => {
  /*
   * The guard that used to sit on the checked-in config files. The drafts moved
   * into a database the repository commits, so a pinned date can still rot there.
   */
  test('the order drafts do not pin a delivery date that has passed', async () => {
    const today = new Date().toISOString().slice(0, 10);

    for (const environment of store.ENVIRONMENTS) {
      const config = await store.getOrderConfig(environment);
      const dates = [config.deliveryDate, ...config.orders.map((order) => order.deliveryDate)]
        .filter(Boolean)
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

      for (const date of dates) {
        assert.ok(
          date >= today,
          `${environment} pins ${date}, which is in the past; a run using it would fail`,
        );
      }
    }
  });

  after(async () => {
    await db().$disconnect();
  });
});
