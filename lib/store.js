/*
 * Everything the app reads and writes, in one place.
 *
 * It replaces a set of JSON files that were read, mutated and written back whole.
 * Two things went wrong with that, both measured on the real data:
 *
 *   - Five runs finishing at once left two history entries. Every one of them
 *     read the file before the others had written it, so all but the last write
 *     were thrown away. Appending a row cannot do that.
 *   - The shape drifted. 480 entries in five shapes, 144 with no environment
 *     recorded at all, because nothing forced a field to keep being written.
 *
 * The JSON shapes are preserved on the way out, so the HTTP contracts and the
 * Angular app are untouched by the move. This module is the only translation
 * layer between them and the tables.
 */

const { db } = require('./db');

/** The environments a store is kept for. */
const ENVIRONMENTS = ['dev', 'staging'];

const SETTING_STAGING_BASE_URL = 'stagingBaseUrl';

/** The single row each profile table holds. */
const PROFILE_ID = 1;

function assertEnvironment(environment) {
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`Unknown environment "${environment}".`);
  }
  return environment;
}

/* ------------------------------------------------------------------ products */

/** A product row and its children, in the shape products.json used. */
function productToJson(product) {
  const json = {
    id: product.slug,
    name: product.name,
    url: product.url,
    variantSelector: product.variantSelector ?? '',
    variants: product.variants.map((variant) => variant.value),
    defaultVariant: product.defaultVariant ?? '',
    quantitySelector: product.quantitySelector ?? '',
    defaultQuantity: product.defaultQuantity,
    // Always a list now. The file held a string, an array or nothing for the
    // same field; the UI normalised all three, so one shape loses nothing.
    origin: product.origins.map((origin) => origin.value),
    type: product.type ?? '',
  };

  // Only two of the 24 products have options, and the file omitted the key
  // entirely for the rest. Emitting an empty array would change what the UI sees.
  if (product.options.length) {
    json.productOptions = product.options.map((option) => ({
      id: option.externalId,
      label: option.label,
      selector: option.selector,
      // A bare string where the choice costs nothing, the object where it does,
      // which is exactly what the file held.
      options: option.choices.map(choiceToJson),
      defaultValue: option.defaultValue ?? '',
    }));
  }

  return json;
}

/** A choice reads back as the string or the object it was written as. */
function choiceToJson(choice) {
  if (choice.label == null && choice.price == null) return choice.value;

  const json = { value: choice.value, label: choice.label ?? choice.value };
  if (choice.price != null) json.price = choice.price;
  return json;
}

/** Accepts both shapes a choice arrives in. */
function toChoiceRow(choice, position) {
  if (typeof choice === 'string') return { value: choice, position };

  return {
    value: choice.value,
    label: choice.label ?? null,
    price: choice.price ?? null,
    position,
  };
}

/** Accepts the string, the array and the absence the file used to hold. */
function toOriginList(origin) {
  if (Array.isArray(origin)) return origin.filter(Boolean);
  return origin ? [origin] : [];
}

const PRODUCT_INCLUDE = {
  origins: { orderBy: { position: 'asc' } },
  variants: { orderBy: { position: 'asc' } },
  options: {
    orderBy: { position: 'asc' },
    include: { choices: { orderBy: { position: 'asc' } } },
  },
};

async function getProducts(environment, client = db()) {
  const products = await client.product.findMany({
    where: { environment: assertEnvironment(environment) },
    orderBy: { position: 'asc' },
    include: PRODUCT_INCLUDE,
  });

  return products.map(productToJson);
}

/**
 * Replaces the catalogue for one store.
 *
 * The whole list is the unit the UI edits, so it is replaced wholesale — but
 * inside one transaction, so a failure halfway leaves the previous catalogue
 * rather than half of the new one. The old endpoint wrote req.body straight to
 * disk, where an empty body left `{}` and the catalogue was gone.
 */
async function saveProducts(environment, products, client = db()) {
  assertEnvironment(environment);

  if (!Array.isArray(products)) {
    throw new TypeError('Products must be an array.');
  }

  return client.$transaction(async (tx) => {
    await tx.product.deleteMany({ where: { environment } });

    for (const [position, product] of products.entries()) {
      await tx.product.create({
        data: {
          environment,
          slug: product.id,
          name: product.name ?? '',
          url: product.url ?? '',
          variantSelector: product.variantSelector || null,
          defaultVariant: product.defaultVariant || null,
          quantitySelector: product.quantitySelector || null,
          defaultQuantity: Number(product.defaultQuantity) || 1,
          type: product.type || null,
          position,
          origins: {
            create: toOriginList(product.origin).map((value, index) => ({
              value,
              position: index,
            })),
          },
          variants: {
            create: (product.variants ?? []).map((value, index) => ({
              value,
              position: index,
            })),
          },
          options: {
            create: (product.productOptions ?? []).map((option, index) => ({
              externalId: option.id,
              label: option.label ?? '',
              selector: option.selector ?? '',
              defaultValue: option.defaultValue || null,
              position: index,
              choices: { create: (option.options ?? []).map(toChoiceRow) },
            })),
          },
        },
      });
    }

    return products.length;
  });
}

/* ------------------------------------------------------------- order drafts */

function draftItemToJson(item) {
  const json = {
    productId: item.productSlug,
    quantity: item.quantity,
  };

  if (item.variant) json.variant = item.variant;
  if (item.deliveryDate) json.deliveryDate = item.deliveryDate;

  if (item.selectedOptions.length) {
    json.productOptions = Object.fromEntries(
      item.selectedOptions.map((option) => [option.optionExternalId, option.value]),
    );
  }

  return json;
}

async function getCustomerProfile(client = db()) {
  const profile = await client.customerProfile.findUnique({ where: { id: PROFILE_ID } });
  if (!profile) return null;

  const { id, updatedAt, ...customerInfo } = profile;
  return customerInfo;
}

async function getPaymentProfile(client = db()) {
  const profile = await client.paymentProfile.findUnique({ where: { id: PROFILE_ID } });
  if (!profile) return null;

  const { id, updatedAt, ...payment } = profile;
  return payment;
}

/** The order-config.json shape, for whichever store is asked for. */
async function getOrderConfig(environment, client = db()) {
  assertEnvironment(environment);

  const [draft, customerInfo, payment] = await Promise.all([
    client.orderDraft.findUnique({
      where: { environment },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: { selectedOptions: true },
        },
      },
    }),
    getCustomerProfile(client),
    getPaymentProfile(client),
  ]);

  const config = {
    deliveryDate: draft?.deliveryDate ?? '',
    customerInfo: customerInfo ?? {},
    payment: payment ?? {},
    orders: (draft?.items ?? []).map(draftItemToJson),
  };

  // The staging draft carries the store it runs against; the dev one has no
  // equivalent, so the key is absent rather than empty for dev.
  if (environment === 'staging') {
    config.stagingBaseUrl = (await getStagingBaseUrl(client)) ?? '';
  }

  return config;
}

/**
 * Saves the draft for one store, and the customer and payment details with it.
 *
 * Those two are shared across stores — the UI has one Customer Info page — so
 * they live in their own tables rather than being copied into each draft, which
 * is how the two config files drifted apart from each other.
 */
async function saveOrderConfig(environment, config, client = db()) {
  assertEnvironment(environment);

  if (!config || typeof config !== 'object') {
    throw new TypeError('Order config must be an object.');
  }

  const items = Array.isArray(config.orders) ? config.orders : [];

  return client.$transaction(async (tx) => {
    await tx.orderDraft.upsert({
      where: { environment },
      create: { environment, deliveryDate: config.deliveryDate || null },
      update: { deliveryDate: config.deliveryDate || null },
    });

    await tx.orderDraftItem.deleteMany({ where: { environment } });

    for (const [position, item] of items.entries()) {
      await tx.orderDraftItem.create({
        data: {
          environment,
          productSlug: item.productId,
          quantity: Number(item.quantity) || 1,
          variant: item.variant || null,
          deliveryDate: item.deliveryDate || null,
          position,
          selectedOptions: {
            create: Object.entries(item.productOptions ?? {}).map(([optionExternalId, value]) => ({
              optionExternalId,
              value,
            })),
          },
        },
      });
    }

    if (config.customerInfo && Object.keys(config.customerInfo).length) {
      const customerInfo = config.customerInfo;
      await tx.customerProfile.upsert({
        where: { id: PROFILE_ID },
        create: { id: PROFILE_ID, ...customerInfo },
        update: customerInfo,
      });
    }

    if (environment === 'staging' && config.stagingBaseUrl !== undefined) {
      await tx.setting.upsert({
        where: { key: SETTING_STAGING_BASE_URL },
        create: { key: SETTING_STAGING_BASE_URL, value: String(config.stagingBaseUrl ?? '') },
        update: { value: String(config.stagingBaseUrl ?? '') },
      });
    }

    if (config.payment && Object.keys(config.payment).length) {
      const payment = config.payment;
      await tx.paymentProfile.upsert({
        where: { id: PROFILE_ID },
        create: { id: PROFILE_ID, ...payment },
        update: payment,
      });
    }

    return items.length;
  });
}

/* ----------------------------------------------------------------- settings */

async function getSetting(key, client = db()) {
  const setting = await client.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

async function setSetting(key, value, client = db()) {
  await client.setting.upsert({
    where: { key },
    create: { key, value: String(value ?? '') },
    update: { value: String(value ?? '') },
  });
}

const getStagingBaseUrl = (client = db()) => getSetting(SETTING_STAGING_BASE_URL, client);
const setStagingBaseUrl = (url, client = db()) =>
  setSetting(SETTING_STAGING_BASE_URL, url, client);

/* ------------------------------------------------------------------ history */

/** One requested line, with whatever options the run chose for it. */
function toRequestedItemRow(item, position) {
  return {
    productSlug: item.productId ?? '',
    quantity: Number(item.quantity) || 1,
    variant: item.variant ?? null,
    deliveryDate: item.deliveryDate ?? null,
    position,
    selectedOptions: {
      create: Object.entries(item.productOptions ?? {}).map(([optionExternalId, value]) => ({
        optionExternalId,
        value,
      })),
    },
  };
}

/** A run row and its children, in the shape order-history.json used. */
function runToJson(run) {
  return {
    orderNumber: run.orderNumber,
    confirmationNumber: run.confirmationNumber,
    orderId: run.orderId,
    adminUrl: run.adminUrl,
    statusUrl: run.statusUrl,
    correlationId: run.correlationId,
    date: run.placedAt.toISOString(),
    environment: run.environment ?? undefined,
    products: run.requestedItems.map((item) => {
      const json = { productId: item.productSlug, quantity: item.quantity };
      if (item.variant) json.variant = item.variant;
      if (item.deliveryDate) json.deliveryDate = item.deliveryDate;
      if (item.selectedOptions.length) {
        json.productOptions = Object.fromEntries(
          item.selectedOptions.map((option) => [option.optionExternalId, option.value]),
        );
      }
      return json;
    }),
    lineItems: run.lineItems.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      variant: item.variant ?? undefined,
      sku: item.sku ?? undefined,
      unitPrice: item.unitPrice ?? undefined,
      image: item.image ?? undefined,
    })),
    customer: run.customerEmail,
    financialStatus: run.financialStatus,
    fulfillmentStatus: run.fulfillmentStatus,
    destination: run.destination,
    shippingMethod: run.shippingMethod,
    subtotal: run.subtotal,
    shipping: run.shipping,
    tax: run.tax,
    discounts: run.discounts,
    // 'N/A' is what every entry held before the store could be asked for a
    // total; kept so the UI's existing handling of it still applies.
    total: run.total ?? 'N/A',
    tags: run.tags.map((tag) => tag.value),
    matchedBy: run.matchedBy,
    source: run.source,
  };
}

const RUN_INCLUDE = {
  requestedItems: {
    orderBy: { position: 'asc' },
    include: { selectedOptions: true },
  },
  lineItems: { orderBy: { position: 'asc' } },
  tags: { orderBy: { position: 'asc' } },
};

/** Oldest first, the order the file was written in. */
async function getOrderHistory(client = db()) {
  const runs = await client.orderRun.findMany({
    orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
    include: RUN_INCLUDE,
  });

  return runs.map(runToJson);
}

async function getLatestOrderRun(client = db()) {
  const [run] = await client.orderRun.findMany({
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: RUN_INCLUDE,
  });

  return run ? runToJson(run) : null;
}

/**
 * Records one finished run.
 *
 * A single insert, which is the point: the file version read the whole history,
 * pushed onto it and wrote it back, so runs finishing together overwrote each
 * other. Five concurrent runs left two entries.
 */
async function addOrderRun(entry, client = db()) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('An order run must be an object.');
  }

  const run = await client.orderRun.create({
    data: {
      placedAt: entry.date ? new Date(entry.date) : new Date(),
      environment: entry.environment ?? null,
      orderNumber: entry.orderNumber ?? null,
      confirmationNumber: entry.confirmationNumber ?? null,
      orderId: entry.orderId ?? null,
      adminUrl: entry.adminUrl ?? null,
      statusUrl: entry.statusUrl ?? null,
      correlationId: entry.correlationId ?? null,
      matchedBy: entry.matchedBy ?? null,
      source: entry.source ?? null,
      customerEmail: entry.customer ?? null,
      financialStatus: entry.financialStatus ?? null,
      fulfillmentStatus: entry.fulfillmentStatus ?? null,
      destination: entry.destination ?? null,
      shippingMethod: entry.shippingMethod ?? null,
      subtotal: entry.subtotal ?? null,
      shipping: entry.shipping ?? null,
      tax: entry.tax ?? null,
      discounts: entry.discounts ?? null,
      // Stored as null rather than the 'N/A' the file used, so "no total" is
      // absence rather than a string that sorts and filters like a value.
      total: entry.total && entry.total !== 'N/A' ? entry.total : null,
      requestedItems: { create: (entry.products ?? []).map(toRequestedItemRow) },
      lineItems: {
        create: (entry.lineItems ?? []).map((item, position) => ({
          title: item.title ?? '',
          quantity: Number(item.quantity) || 1,
          variant: item.variant ?? null,
          sku: item.sku ?? null,
          unitPrice: item.unitPrice ?? null,
          image: item.image ?? null,
          position,
        })),
      },
      tags: {
        create: [...new Set(entry.tags ?? [])].map((value, position) => ({ value, position })),
      },
    },
    include: RUN_INCLUDE,
  });

  return runToJson(run);
}

module.exports = {
  ENVIRONMENTS,
  SETTING_STAGING_BASE_URL,
  getProducts,
  saveProducts,
  getOrderConfig,
  saveOrderConfig,
  getCustomerProfile,
  getPaymentProfile,
  getSetting,
  setSetting,
  getStagingBaseUrl,
  setStagingBaseUrl,
  getOrderHistory,
  getLatestOrderRun,
  addOrderRun,
  productToJson,
  runToJson,
  toOriginList,
  toChoiceRow,
  choiceToJson,
  toRequestedItemRow,
};
