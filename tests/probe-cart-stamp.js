#!/usr/bin/env node
/*
 * Checks whether a cart attribute set BEFORE anything is added survives the
 * add-to-cart that follows.
 *
 * Stamping after add-to-cart works, but /cart/update.js makes the theme tear down
 * its cart sidebar, and the checkout button never comes back. Stamping first
 * leaves the checkout flow untouched, provided the attribute actually persists.
 *
 * Places no order.
 *
 *   node tests/probe-cart-stamp.js
 */

const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('@playwright/test');

const { RUN_ATTRIBUTE } = require('../lib/order-lookup');

async function main() {
  const products = JSON.parse(
    await fs.readFile(path.join(__dirname, '..', 'products.json'), 'utf8'),
  );
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(products[0].url, { waitUntil: 'domcontentloaded' });

    const stamped = await page.evaluate(
      ([key, value]) =>
        fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes: { [key]: value } }),
        }).then((r) => r.json()),
      [RUN_ATTRIBUTE, 'probe-run-id'],
    );
    console.log(`1. marcado en carrito vacio -> ${JSON.stringify(stamped.attributes)}`);

    const variantId = await page.evaluate(
      () => document.querySelector('input[name="id"],select[name="id"]')?.value ?? null,
    );
    await page.evaluate(
      (id) =>
        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: Number(id), quantity: 1 }] }),
        }).then((r) => r.json()),
      variantId,
    );

    const after = await page.evaluate(() => fetch('/cart.js').then((r) => r.json()));
    console.log(`2. tras add.js            -> ${JSON.stringify(after.attributes)}`);
    console.log(`   items: ${after.item_count}  token: ${String(after.token).split('?')[0]}`);
    console.log(
      `\nel atributo ${after.attributes?.[RUN_ATTRIBUTE] === 'probe-run-id' ? 'SOBREVIVE' : 'NO sobrevive'}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
