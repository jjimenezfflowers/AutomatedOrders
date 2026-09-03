#!/usr/bin/env node
/*
 * Moves the JSON files into the database, once.
 *
 *   node prisma/seed-from-json.js [--force]
 *
 * Verbatim: a migration preserves what was there rather than improving it. The
 * history holds order numbers that are really page prose — "Your order number
 * is: DEV-BB-50F2327" — and the UI already extracts the number from them at
 * display time. Rewriting them here would silently change records of real orders
 * on the way past, which is not a migration's job.
 *
 * Refuses to run against a database that already holds rows unless --force is
 * given, so running it twice cannot double the history.
 */

const fs = require('fs').promises;
const path = require('path');

const { createClient, databaseUrl } = require('../lib/db');
const { toOriginList, toChoiceRow, toRequestedItemRow } = require('../lib/store');

const ROOT = path.join(__dirname, '..');

/** Reads a JSON file, or returns `fallback` when it is not there. */
async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function seedProducts(client, environment, file) {
  const products = await readJson(file, []);
  if (!Array.isArray(products) || !products.length) return 0;

  for (const [position, product] of products.entries()) {
    await client.product.create({
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
          create: toOriginList(product.origin).map((value, index) => ({ value, position: index })),
        },
        variants: {
          create: (product.variants ?? []).map((value, index) => ({ value, position: index })),
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
}

async function seedDraft(client, environment, config) {
  if (!config) return 0;

  await client.orderDraft.create({
    data: { environment, deliveryDate: config.deliveryDate || null },
  });

  const items = Array.isArray(config.orders) ? config.orders : [];
  for (const [position, item] of items.entries()) {
    await client.orderDraftItem.create({
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

  return items.length;
}

async function seedHistory(client, entries) {
  for (const entry of entries) {
    await client.orderRun.create({
      data: {
        placedAt: entry.date ? new Date(entry.date) : new Date(0),
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
    });
  }

  return entries.length;
}

async function main() {
  const force = process.argv.includes('--force');
  const client = createClient();

  try {
    const existing = await client.orderRun.count();
    if (existing && !force) {
      console.error(
        `The database already holds ${existing} runs. Pass --force to clear and reload.`,
      );
      process.exitCode = 1;
      return;
    }

    if (force) {
      // Children go with their parents through the cascades on the relations.
      await client.orderRun.deleteMany();
      await client.orderDraftItem.deleteMany();
      await client.orderDraft.deleteMany();
      await client.product.deleteMany();
      await client.setting.deleteMany();
    }

    console.log(`Seeding ${databaseUrl()}`);

    const dev = await seedProducts(client, 'dev', 'products.json');
    const staging = await seedProducts(client, 'staging', 'products-staging.json');
    console.log(`  products         dev ${dev}, staging ${staging}`);

    const config = await readJson('order-config.json');
    const stagingConfig = await readJson('order-config-staging.json');
    const devItems = await seedDraft(client, 'dev', config);
    const stagingItems = await seedDraft(client, 'staging', stagingConfig);
    console.log(`  order drafts     dev ${devItems} item(s), staging ${stagingItems} item(s)`);

    if (config?.customerInfo && Object.keys(config.customerInfo).length) {
      await client.customerProfile.create({ data: { id: 1, ...config.customerInfo } });
      console.log('  customer profile 1');
    }
    if (config?.payment && Object.keys(config.payment).length) {
      await client.paymentProfile.create({ data: { id: 1, ...config.payment } });
      console.log('  payment profile  1');
    }

    const staging_ = await readJson('staging-config.json');
    if (staging_?.stagingBaseUrl) {
      await client.setting.create({
        data: { key: 'stagingBaseUrl', value: staging_.stagingBaseUrl },
      });
      console.log('  settings         stagingBaseUrl');
    }

    const history = await readJson('order-history.json', []);
    const runs = await seedHistory(client, history);
    console.log(`  order history    ${runs} run(s)`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
