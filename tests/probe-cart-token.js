#!/usr/bin/env node
/*
 * Checks whether the storefront cart token — the one the Ajax API documents at
 * /cart.js — is the value the Admin API later files the order under as
 * `cart_token`. If it is, a run can link itself to its order exactly, instead of
 * reading the confirmation page.
 *
 * Adds an item to a cart and reads the token. Places no order.
 *
 *   node tests/probe-cart-token.js
 */

const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('@playwright/test');

async function main() {
  const products = JSON.parse(
    await fs.readFile(path.join(__dirname, '..', 'products.json'), 'utf8'),
  );
  const product = products[0];
  if (!product) throw new Error('products.json is empty.');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded' });

    const empty = await page.evaluate(() => fetch('/cart.js').then((r) => r.json()));
    console.log(`cart vacio      token=${empty.token ?? '(ninguno)'}  items=${empty.item_count}`);

    // A cart only gets a token once it holds something.
    const variantId = await page.evaluate(() =>
      document.querySelector('input[name="id"],select[name="id"]')?.value ?? null,
    );
    console.log(`variant id      ${variantId ?? '(no encontrado en el form)'}`);

    if (variantId) {
      const added = await page.evaluate(
        (id) =>
          fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ id: Number(id), quantity: 1 }] }),
          }).then((r) => r.json()),
        variantId,
      );
      console.log(`add.js          ${added.status ? `rechazado: ${added.description ?? added.message}` : 'ok'}`);
    }

    const cart = await page.evaluate(() => fetch('/cart.js').then((r) => r.json()));
    console.log(`cart con item   token=${cart.token ?? '(ninguno)'}  items=${cart.item_count}`);
    console.log(`\ntoken length    ${cart.token ? cart.token.length : 0}`);
    console.log(`formato         ${cart.token ? (cart.token.includes('?') ? 'token?key=… (nuevo)' : 'token plano') : 'n/a'}`);
    console.log(`\ncomparar contra el cart_token de una orden real: hWNGO828YDgpYmSDFMKyD3Cs (24 chars, plano)`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
