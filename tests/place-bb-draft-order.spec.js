const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const {
  addConfiguredProduct,
  applyConfiguredAddresses,
  selectExistingCustomer,
} = require('./helpers/bb-draft-order');
const { readCheckoutError } = require('./helpers/checkout');
const { captureOrder } = require('./helpers/order-capture');
const { OrderLookup } = require('../lib/order-lookup');
const { hasCredentials } = require('../lib/shopify');
const store = require('../lib/store');
const { disconnect } = require('../lib/db');

const ENVIRONMENT = process.env.RUN_ENVIRONMENT === 'staging' ? 'staging' : 'dev';
const BB_BASE_URL = process.env.BB_BASE_URL
  || `https://bloom-brain-${ENVIRONMENT === 'staging' ? 'stage' : 'dev'}.fiftyflowers.com`;
const AUTH_STATE = path.resolve(process.env.BB_STORAGE_STATE || `tests/.auth/bb-${ENVIRONMENT}.json`);
const BB_PROFILE = path.resolve(process.env.BB_PROFILE_DIR || `tests/.auth/bb-${ENVIRONMENT}-profile`);
const ACTION_TIMEOUT = 20_000;
const NAVIGATION_TIMEOUT = 30_000;
const ORDER_TIMEOUT = 180_000;
const CHECKOUT_URL = /\/(?:invoices|checkouts)(?:\/|$|\?)/i;

let bbContext;

test.afterEach(async () => {
  if (bbContext) {
    await bbContext.close();
    bbContext = null;
  }
});

test.afterAll(async () => {
  await disconnect();
});

async function continueToPayment(page) {
  const shippingSelect = page.locator('select[id^="SelectP"], select[name*="shipping" i]').first();
  if (await shippingSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const options = await shippingSelect.locator('option').count();
    if (options > 1) await shippingSelect.selectOption({ index: 1 });
  }

  for (let step = 0; step < 3; step += 1) {
    const next = page.getByRole('button', { name: /continue to (shipping|payment)/i }).first();
    if (!(await next.isVisible({ timeout: 2_000 }).catch(() => false))) break;
    const label = ((await next.textContent()) || 'next checkout step').trim();
    console.log(`BB: clicking ${label}`);
    await next.click();
  }
}

async function openCheckout(context, currentPage, paymentLink) {
  await paymentLink.click();
  let checkoutPage;
  await expect.poll(async () => {
    for (const candidate of context.pages()) {
      if (candidate.isClosed() || !CHECKOUT_URL.test(candidate.url())) continue;
      const nextStep = candidate.getByRole('button', { name: /continue to (shipping|payment)/i });
      const paymentField = candidate.locator('#number, input[name="number"], iframe');
      if (await nextStep.count() || await paymentField.count()) {
        checkoutPage = candidate;
        return true;
      }
    }
    return false;
  }, { timeout: NAVIGATION_TIMEOUT, message: 'Waiting for a usable Shopify checkout page' }).toBe(true);

  checkoutPage.setDefaultTimeout(ACTION_TIMEOUT);
  checkoutPage.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
  await checkoutPage.bringToFront();
  return checkoutPage;
}

async function fillPayment(page, payment) {
  const directNumber = page.locator('input[name="number"]:not([data-honeypot-field])').first();
  const framedNumber = page
    .frameLocator('iframe[id^="card-fields-number-"]')
    .locator('input[data-current-field="number"]');
  const paymentFieldType = await Promise.any([
    directNumber.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'direct'),
    framedNumber.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'framed'),
  ]).catch(() => null);

  if (paymentFieldType === 'direct') {
    await directNumber.fill(payment.cardNumber);
    await page.locator('input[name="expiry"]:not([data-honeypot-field])').first().fill(payment.expiry);
    await page
      .locator('input[name="verification_value"]:not([data-honeypot-field])')
      .first()
      .fill(payment.cvv);
    return;
  }

  if (paymentFieldType !== 'framed') {
    throw new Error('Shopify payment fields did not become available.');
  }

  const framedExpiry = page
    .frameLocator('iframe[id^="card-fields-expiry-"]')
    .locator('input[data-current-field="expiry"]');
  const framedCvv = page
    .frameLocator('iframe[id^="card-fields-verification_value-"]')
    .locator('input[data-current-field="verification_value"]');

  await framedNumber.pressSequentially(payment.cardNumber, { delay: 80 });
  await framedExpiry.pressSequentially(payment.expiry, { delay: 80 });
  await framedCvv.pressSequentially(payment.cvv, { delay: 80 });
}

test('Place configured order through BB Draft Orders', async () => {
  test.setTimeout(ORDER_TIMEOUT);

  fs.mkdirSync(BB_PROFILE, { recursive: true });
  bbContext = await chromium.launchPersistentContext(BB_PROFILE, {
    headless: process.env.HEADLESS === 'true' || process.platform === 'linux',
    ...(process.platform !== 'linux' ? { channel: 'chrome' } : {}),
    viewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  let page = bbContext.pages()[0] || await bbContext.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT);
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

  const orderConfig = await store.getOrderConfig(ENVIRONMENT);
  const products = await store.getProducts(ENVIRONMENT);
  const customer = orderConfig.customerInfo || {};
  const payment = orderConfig.payment || {};
  const runStartedAt = new Date();
  const lookup = hasCredentials() ? new OrderLookup({ environment: ENVIRONMENT }) : null;

  if (!orderConfig.orders.length) throw new Error('Select at least one configured product.');
  if (!payment.cardNumber || !payment.expiry || !payment.cvv) {
    throw new Error('Complete the shared payment profile before placing an order through BB.');
  }

  await page.goto(`${BB_BASE_URL}/v2/order-manager/draft-orders`);
  await page.bringToFront();
  await expect(page.getByRole('heading', { name: 'Draft Orders', exact: true })).toBeVisible({
    timeout: 60_000,
  });
  console.log(`BB ${ENVIRONMENT}: authenticated and ready`);

  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
  await bbContext.storageState({ path: AUTH_STATE });

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByText('Create draft order', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create Draft Order' })).toBeVisible();
  console.log('BB: draft order form opened');

  for (const order of orderConfig.orders) {
    const product = products.find(candidate => candidate.id === order.productId);
    if (!product) throw new Error(`Configured product ${order.productId} was not found in ${ENVIRONMENT}.`);

    console.log(`Adding ${product.name} to the BB draft order`);
    await addConfiguredProduct(page, product, order, orderConfig.deliveryDate);
  }

  await selectExistingCustomer(page, customer);
  console.log(`BB: customer selected (${customer.email})`);
  // Map the shared address explicitly into both BB address slots. This keeps the
  // run tied to what is configured in this app instead of stale customer data in BB.
  await applyConfiguredAddresses(page, customer);
  console.log('BB: billing and shipping addresses saved');

  await expect(page.getByRole('button', { name: 'Submit to Shopify', exact: true })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Submit to Shopify', exact: true }).click();
  console.log('BB: draft submitted to Shopify');

  await expect(page.getByText('Draft order created successfully', { exact: true })).toBeVisible({ timeout: 20_000 });
  const paymentLink = page.getByRole('link', { name: 'Proceed to payment' }).first();
  await expect(paymentLink).toBeVisible();
  page = await openCheckout(bbContext, page, paymentLink);
  console.log('BB: Shopify invoice checkout opened');

  await continueToPayment(page);
  console.log('BB: payment form ready');
  await fillPayment(page, payment);
  console.log('BB: payment details entered');

  const checkoutUrl = page.url();
  const payButton = page.locator('#checkout-pay-button').or(
    page.locator('button[type="submit"]').filter({ hasText: /pay|complete|order/i }),
  ).first();
  await expect(payButton).toBeVisible();
  console.log('BB: submitting payment');
  await payButton.click();
  await page.waitForURL(/\/thank[-_]?you|\/orders\//, { timeout: 60_000 });

  const checkoutError = await readCheckoutError(page);
  if (checkoutError) throw new Error(`Checkout error detected: ${checkoutError}`);

  const order = await captureOrder({
    page,
    lookup,
    checkoutUrl,
    since: runStartedAt,
    productTitles: orderConfig.orders
      .map(entry => products.find(product => product.id === entry.productId)?.name)
      .filter(Boolean),
  });

  await store.addOrderRun({
    orderNumber: order.orderNumber,
    shopifyOrderNumber: order.shopifyOrderNumber ?? null,
    confirmationNumber: order.confirmationNumber,
    orderId: order.id,
    statusUrl: order.statusUrl,
    adminUrl: order.adminUrl ?? null,
    date: new Date().toISOString(),
    environment: ENVIRONMENT,
    purpose: orderConfig.purpose || undefined,
    products: orderConfig.orders,
    lineItems: order.products ?? [],
    customer: customer.email,
    financialStatus: order.financialStatus ?? null,
    fulfillmentStatus: order.fulfillmentStatus ?? null,
    destination: order.destination ?? null,
    shippingMethod: order.shippingMethod ?? null,
    subtotal: order.subtotal ?? null,
    shipping: order.shipping ?? null,
    tax: order.tax ?? null,
    discounts: order.discounts ?? null,
    total: order.total ?? 'N/A',
    tags: order.tags ?? [],
    matchedBy: order.matchedBy ?? null,
    source: order.source,
  });

  console.log(`BB order placed successfully: ${order.orderNumber || '(number not captured)'}`);
});
