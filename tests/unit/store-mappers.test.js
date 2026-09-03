const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  toOriginList,
  toChoiceRow,
  choiceToJson,
  toRequestedItemRow,
  productToJson,
  runToJson,
} = require('../../lib/store');

/*
 * The translation between the tables and the JSON the HTTP endpoints still
 * speak. It is the whole risk of the migration: the Angular app was not touched,
 * so anything these get wrong reaches the screen as missing or malformed data.
 */

describe('toOriginList', () => {
  test('accepts all three shapes the file held for one field', () => {
    // Across 27 products: a bare string once, an array 21 times, absent 5 times.
    assert.deepEqual(toOriginList('EC'), ['EC']);
    assert.deepEqual(toOriginList(['US', 'EC']), ['US', 'EC']);
    assert.deepEqual(toOriginList(undefined), []);
    assert.deepEqual(toOriginList(null), []);
    assert.deepEqual(toOriginList(''), []);
  });

  test('drops empty entries rather than storing blank origins', () => {
    assert.deepEqual(toOriginList(['US', '', null, 'EC']), ['US', 'EC']);
  });
});

describe('option choices', () => {
  test('a plain string stays a plain string', () => {
    assert.deepEqual(toChoiceRow('White', 0), { value: 'White', position: 0 });
    assert.equal(choiceToJson({ value: 'White', label: null, price: null }), 'White');
  });

  test('a priced choice keeps its label and price', () => {
    // The file mixed both inside one array: "White" beside
    // { value: "Cream", label: "Cream Add $9.00", price: 9 }.
    const row = toChoiceRow({ value: 'Cream', label: 'Cream Add $9.00', price: 9 }, 2);

    assert.deepEqual(row, { value: 'Cream', label: 'Cream Add $9.00', price: 9, position: 2 });
    assert.deepEqual(choiceToJson(row), {
      value: 'Cream',
      label: 'Cream Add $9.00',
      price: 9,
    });
  });

  test('round-trips both shapes without changing either', () => {
    for (const choice of ['White', { value: 'Cream', label: 'Cream Add $9.00', price: 9 }]) {
      assert.deepEqual(choiceToJson(toChoiceRow(choice, 0)), choice);
    }
  });

  test('a labelled choice with no price keeps the label', () => {
    const row = toChoiceRow({ value: 'Peach', label: 'Peach Spray Roses' }, 0);

    assert.deepEqual(choiceToJson(row), { value: 'Peach', label: 'Peach Spray Roses' });
  });
});

describe('toRequestedItemRow', () => {
  test('carries the option selections a run made', () => {
    // These were dropped by the first cut of the migration: 189 values recording
    // which greenery and which colours a kit was ordered with.
    const row = toRequestedItemRow(
      {
        productId: 'wedding-flower-kit',
        quantity: 1,
        variant: 'Wedding Combo Box',
        productOptions: { vo_0_1381: 'Bear Grass 40 shoots per Bunch' },
      },
      0,
    );

    assert.equal(row.productSlug, 'wedding-flower-kit');
    assert.deepEqual(row.selectedOptions.create, [
      { optionExternalId: 'vo_0_1381', value: 'Bear Grass 40 shoots per Bunch' },
    ]);
  });

  test('defaults a missing quantity to one rather than to zero', () => {
    // Number(undefined) is NaN and Number('') is 0; neither is a quantity.
    assert.equal(toRequestedItemRow({ productId: 'x' }, 0).quantity, 1);
    assert.equal(toRequestedItemRow({ productId: 'x', quantity: '' }, 0).quantity, 1);
    assert.equal(toRequestedItemRow({ productId: 'x', quantity: 3 }, 0).quantity, 3);
  });
});

describe('productToJson', () => {
  const row = {
    slug: 'floreana-white-spray-roses',
    name: 'Floreana White Spray Roses',
    url: 'https://example.myshopify.com/products/roses',
    variantSelector: '#option-0',
    defaultVariant: '20 stems',
    quantitySelector: '#quantity-1',
    defaultQuantity: 1,
    type: null,
    origins: [{ value: 'EC' }],
    variants: [{ value: '20 stems' }, { value: '50 stems' }],
    options: [],
  };

  test('reads back in the shape products.json held', () => {
    assert.deepEqual(productToJson(row), {
      id: 'floreana-white-spray-roses',
      name: 'Floreana White Spray Roses',
      url: 'https://example.myshopify.com/products/roses',
      variantSelector: '#option-0',
      variants: ['20 stems', '50 stems'],
      defaultVariant: '20 stems',
      quantitySelector: '#quantity-1',
      defaultQuantity: 1,
      origin: ['EC'],
      type: '',
    });
  });

  test('omits productOptions entirely when there are none', () => {
    // The file omitted the key for 22 of 24 products; an empty array would be a
    // different thing to the UI than an absent one.
    assert.ok(!('productOptions' in productToJson(row)));
  });

  test('includes productOptions when the product has them', () => {
    const json = productToJson({
      ...row,
      options: [
        {
          externalId: 'vo_0_1381',
          label: 'Choose 5 Soft Greenery Bunches',
          selector: '#form-item',
          defaultValue: 'Lily Grass',
          choices: [{ value: 'Bear Grass', label: null, price: null }],
        },
      ],
    });

    assert.deepEqual(json.productOptions, [
      {
        id: 'vo_0_1381',
        label: 'Choose 5 Soft Greenery Bunches',
        selector: '#form-item',
        options: ['Bear Grass'],
        defaultValue: 'Lily Grass',
      },
    ]);
  });

  test('renders an absent selector as the empty string the file used', () => {
    const json = productToJson({ ...row, variantSelector: null, quantitySelector: null });

    assert.equal(json.variantSelector, '');
    assert.equal(json.quantitySelector, '');
  });
});

describe('runToJson', () => {
  const row = {
    placedAt: new Date('2026-09-03T02:37:08.000Z'),
    environment: 'dev',
    orderNumber: 'DEV-BB-50F5474',
    confirmationNumber: 'FUY0HXCMI',
    orderId: 'gid://shopify/Order/1',
    adminUrl: 'https://admin.shopify.com/store/s/orders/1',
    statusUrl: null,
    correlationId: null,
    matchedBy: 'cartToken',
    source: 'api',
    customerEmail: 'jose@fiftyflowers.com',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    destination: 'Bristol, CT, US',
    shippingMethod: 'Free Express Shipping',
    subtotal: '108.00 USD',
    shipping: '0.00 USD',
    tax: '6.86 USD',
    discounts: '11.99 USD',
    total: '114.86 USD',
    requestedItems: [
      {
        productSlug: 'roses',
        quantity: 2,
        variant: '20 stems',
        deliveryDate: '2026-09-15',
        selectedOptions: [{ optionExternalId: 'vo_0', value: 'Bear Grass' }],
      },
    ],
    lineItems: [
      {
        title: 'Roses',
        quantity: 2,
        variant: '20 stems',
        sku: 'FF-1',
        unitPrice: '119.99 USD',
        image: null,
      },
    ],
    tags: [{ value: 'bb-1' }, { value: 'PRO10' }],
  };

  test('reads back in the shape order-history.json held', () => {
    const json = runToJson(row);

    assert.equal(json.orderNumber, 'DEV-BB-50F5474');
    assert.equal(json.date, '2026-09-03T02:37:08.000Z');
    assert.equal(json.customer, 'jose@fiftyflowers.com');
    assert.deepEqual(json.tags, ['bb-1', 'PRO10']);
  });

  test('keeps the option selections a run made', () => {
    assert.deepEqual(runToJson(row).products[0].productOptions, { vo_0: 'Bear Grass' });
  });

  test('omits productOptions on lines that had none', () => {
    const bare = runToJson({
      ...row,
      requestedItems: [{ productSlug: 'roses', quantity: 1, selectedOptions: [] }],
    });

    assert.ok(!('productOptions' in bare.products[0]));
  });

  test("reports a missing total as 'N/A', which is what the file held", () => {
    // Stored as null, so it sorts and filters as absence; rendered as the string
    // the UI has always handled.
    assert.equal(runToJson({ ...row, total: null }).total, 'N/A');
  });

  test('leaves environment undefined on the entries that never had one', () => {
    // 144 of the migrated runs predate the staging store.
    assert.equal(runToJson({ ...row, environment: null }).environment, undefined);
  });
});
