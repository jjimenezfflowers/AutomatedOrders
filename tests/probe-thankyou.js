#!/usr/bin/env node
/*
 * Places one order and inventories the confirmation page, to find out what the
 * store actually exposes there — the order number, a confirmation reference, and
 * any identifier we could hand to the Shopify Admin API (order id, checkout token).
 *
 * Two real runs recorded an order the store accepted but no number, and guessing
 * at the markup from the outside is how a hex colour ended up stored as one. This
 * looks instead of guessing.
 *
 *   node tests/probe-thankyou.js
 *
 * Output is redacted: values that look like contact details are replaced, because
 * the point is the shape of what is available, not the customer's address.
 */

const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('@playwright/test');

const store = require('../lib/store');
const { disconnect } = require('../lib/db');

const {
  clickAddToCart,
  selectDeliveryDate,
  selectProductOptionsFromOrder,
  selectVariantFromOrder,
  setQuantityFromOrder,
} = require('./helpers/product-form');

const ROOT = path.join(__dirname, '..');

/** Anything that looks like contact data is replaced before printing. */
function redact(value) {
  return String(value ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '<phone>')
    .replace(/\b\d{13,19}\b/g, '<card>');
}

async function main() {
  const config = await store.getOrderConfig('dev');
  const products = await store.getProducts('dev');

  const order = config.orders[0];
  if (!order) throw new Error('The order draft is empty; configure one first.');
  const product = products.find((p) => p.id === order.productId);
  if (!product) throw new Error(`Product ${order.productId} not found.`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log(`Ordering ${product.name} for ${order.deliveryDate ?? config.deliveryDate}…`);

    await page.goto(product.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    if (order.variant) await selectVariantFromOrder(page, product, order);
    await selectProductOptionsFromOrder(page, product, order, { log: () => {} });
    await selectDeliveryDate(page, order.deliveryDate ?? config.deliveryDate, { log: () => {} });
    await setQuantityFromOrder(page, product, order);
    await clickAddToCart(page);
    await page.waitForTimeout(2500);

    await page.locator('#cart-sidebar-checkout').click();

    const customer = config.customerInfo;
    await page.locator('#email').click();
    await page.locator('div._9F1Rf').click();
    await page.locator('#email').fill(customer.email);
    await page.locator('input[name="firstName"]').first().fill(customer.firstName);
    await page.locator('input[name="lastName"]').first().fill(customer.lastName);
    await page.locator('#shipping-address1').fill(customer.address);
    await page.locator('input[name="city"]').first().fill(customer.city);
    await page.locator('select[name="countryCode"]').selectOption('US');
    await page.locator('select[name="zone"]').selectOption(customer.state);
    await page.locator('input[name="postalCode"]').first().fill(customer.zipCode);
    await page.locator('input[name="phone"]').first().fill(customer.phone);

    await page.locator('div.MV9Am button').click();
    await page.waitForSelector('button:has-text("Continue to payment")', { timeout: 10000 });
    await page.locator('button').filter({ hasText: 'Continue to payment' }).first().click();
    await page.waitForTimeout(3000);

    const cardNumber = page.locator('input[name="number"], #number').first();
    await cardNumber.click();
    await cardNumber.pressSequentially(config.payment.cardNumber, { delay: 60 });
    await page.keyboard.press('Tab');
    await page.keyboard.type(config.payment.expiry, { delay: 60 });
    await page.keyboard.press('Tab');
    await page.keyboard.type(config.payment.cvv, { delay: 60 });

    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /pay|complete|order/i })
      .first()
      .click();

    await page.waitForTimeout(8000);
    await page
      .waitForSelector('span.os-order-number, h2:has-text("Thank"), .notice__text', {
        timeout: 30000,
      })
      .catch(() => {});
    await page.waitForTimeout(2000);

    console.log('\n=== URL ===');
    console.log(' ', redact(page.url()));

    const inventory = await page.evaluate(() => {
      const pick = (object, depth = 0) => {
        if (object === null || typeof object !== 'object' || depth > 2) return object;
        const out = {};
        for (const key of Object.keys(object).slice(0, 40)) {
          const value = object[key];
          if (typeof value === 'function') continue;
          out[key] = pick(value, depth + 1);
        }
        return out;
      };

      const text = document.body.innerText || '';
      return {
        shopify: typeof window.Shopify !== 'undefined' ? pick(window.Shopify) : null,
        trekkie: typeof window.__st !== 'undefined' ? pick(window.__st) : null,
        checkout: typeof window.Checkout !== 'undefined' ? pick(window.Checkout) : null,
        meta: Array.from(document.querySelectorAll('meta[name],meta[property]'))
          .map((m) => `${m.getAttribute('name') || m.getAttribute('property')}=${m.content}`)
          .slice(0, 20),
        dataAttrs: Array.from(document.querySelectorAll('[data-order-id],[data-order-number],[data-checkout-token],[data-order]'))
          .map((el) => el.outerHTML.slice(0, 160)),
        orderLines: text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /order|confirmation|#/i.test(line))
          .slice(0, 12),
        scriptHints: Array.from(document.querySelectorAll('script'))
          .map((s) => s.textContent || '')
          .join(' ')
          .match(/"(?:order_id|orderId|checkout_token|checkoutToken|token|order_number)"\s*:\s*"?[\w-]+"?/g)
          ?.slice(0, 12) ?? [],
      };
    });

    console.log('\n=== window.Shopify ===');
    console.log(' ', redact(JSON.stringify(inventory.shopify)).slice(0, 600));
    console.log('\n=== window.__st (trekkie) ===');
    console.log(' ', redact(JSON.stringify(inventory.trekkie)).slice(0, 600));
    console.log('\n=== window.Checkout ===');
    console.log(' ', redact(JSON.stringify(inventory.checkout)).slice(0, 400));
    console.log('\n=== meta ===');
    inventory.meta.forEach((m) => console.log('  ' + redact(m).slice(0, 120)));
    console.log('\n=== data-* de orden ===');
    inventory.dataAttrs.forEach((d) => console.log('  ' + redact(d)));
    console.log('\n=== lineas con "order"/"confirmation"/# ===');
    inventory.orderLines.forEach((l) => console.log('  ' + redact(l).slice(0, 120)));
    console.log('\n=== identificadores en scripts inline ===');
    inventory.scriptHints.forEach((h) => console.log('  ' + redact(h)));
  } finally {
    await browser.close();
    await disconnect();
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
});
