const { test, expect } = require("@playwright/test");
const fs = require("fs").promises;
const { randomUUID } = require("crypto");
const path = require("path");
const {
  clickAddToCart,
  selectDeliveryDate,
  selectProductOptionsFromOrder,
  selectVariantFromOrder,
  setQuantityFromOrder,
} = require("./helpers/product-form");
const { readCheckoutError } = require("./helpers/checkout");
const { readCartToken, stampCart } = require("./helpers/cart-token");
const { captureOrder } = require("./helpers/order-capture");
const { OrderLookup } = require("../lib/order-lookup");
const { hasCredentials } = require("../lib/shopify");
const store = require("../lib/store");
const { disconnect } = require("../lib/db");

// When STAGING_BASE_URL is set, rewrite product URLs to point at the staging store.
const STAGING_BASE_URL = process.env.STAGING_BASE_URL
  ? process.env.STAGING_BASE_URL.replace(/\/$/, '')
  : null;

/*
 * Which store this run is for. The server names it directly now that the drafts
 * live in the database; STAGING_CONFIG still implies staging so the older way of
 * invoking a staging run keeps working.
 */
const ENVIRONMENT =
  process.env.RUN_ENVIRONMENT || (process.env.STAGING_CONFIG ? 'staging' : 'dev');

/*
 * A named config file still overrides the draft. `npm run test:peach-sorbet` and
 * ORDER_CONFIG=… select a run by filename, and those are run inputs rather than
 * application state, so they stayed as files.
 */
const CONFIG_FILE = process.env.STAGING_CONFIG || process.env.ORDER_CONFIG || null;

function resolveProductUrl(url) {
  if (!STAGING_BASE_URL) return url;
  try {
    const parsed = new URL(url);
    const staging = new URL(STAGING_BASE_URL);
    parsed.protocol = staging.protocol;
    parsed.host = staging.host;
    return parsed.toString();
  } catch {
    return url;
  }
}

async function loadOrderConfig() {
  if (!CONFIG_FILE) return store.getOrderConfig(ENVIRONMENT);

  const config = JSON.parse(await fs.readFile(path.join(__dirname, '..', CONFIG_FILE), 'utf8'));

  // The alternate configs carry order lines only, so the customer and the card
  // come from the store, which is where the UI keeps them.
  config.customerInfo ??= await store.getCustomerProfile();
  config.payment ??= await store.getPaymentProfile();

  return config;
}

const loadProducts = () => store.getProducts(ENVIRONMENT);

// Playwright waits for the process to be idle; an open database connection is
// not idle, so the run would hang after the order was already placed.
test.afterAll(async () => {
  await disconnect();
});

test("Place order from config", async ({ page, context }) => {
  
  const orderConfig = await loadOrderConfig();
  const products = await loadProducts();
  const customer = orderConfig.customerInfo;
  const payment = orderConfig.payment;

  /*
   * Noted before anything is ordered, so the order this run created can be told
   * apart from ones already sitting in the store.
   */
  const runStartedAt = new Date();
  const lookup = hasCredentials() ? new OrderLookup({ environment: ENVIRONMENT }) : null;
  if (!lookup) {
    console.log('ℹ️  Sin credenciales de Shopify: el numero de orden saldra de la pagina');
  }

  /* The cart's own token, which identifies the resulting order exactly. */
  let cartToken = null;

  /*
   * An id of this run's own making, stamped on the cart and read back off the
   * order. Unlike the cart token it depends on nothing Shopify might withdraw.
   */
  const correlationId = randomUUID();

  for (let i = 0; i < orderConfig.orders.length; i++) {
    const order = orderConfig.orders[i];
    const product = products.find((p) => p.id === order.productId);
    if (!product) {
      console.log(`Product ${order.productId} not found`);
      continue;
    }

    await page.goto(resolveProductUrl(product.url));

    /*
     * Stamped before anything is added, and only once. /cart/update.js makes the
     * theme tear down its cart sidebar, and the checkout button never comes back,
     * so doing this after add-to-cart strands the run on the product page. The
     * attribute survives the add either way, which is what makes the earlier
     * moment the right one.
     */
    if (i === 0 && (await stampCart(page, correlationId))) {
      console.log(`  ✅ Carrito marcado para esta corrida`);
    }
    await page.waitForLoadState('domcontentloaded');
    
    // Wait a moment for page to settle after navigation
    await page.waitForTimeout(1000);
    
    // Close sidecart if it's open from previous product
    const sidebarClose = page.locator('.halo-sidebar-close, a[data-close-cart-sidebar]');
    const isSidebarOpen = await sidebarClose.first().isVisible({ timeout: 2000 }).catch(() => false);
    if (isSidebarOpen) {
      console.log('  ⚠️  Sidebar detected open on page load, closing...');
      await sidebarClose.first().click();
      // Wait for sidebar to fully close
      await page.waitForTimeout(1500);
      // Verify sidebar wrapper is hidden
      await page.locator('.halo-sidebar-wrapper, #cart-sidebar-wrapper, [data-cart-sidebar]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      console.log('  ✅ Sidebar closed');
    }
    
    // Select variant FIRST if product has one configured (this can reload the calendar)
    if (order.variant) {
      console.log(`\n🔧 Paso 1: Seleccionando variante...`);
      console.log(`  Valor deseado: "${order.variant}"`);
      const selectedVariant = await selectVariantFromOrder(page, product, order);
      console.log(`  ✅ Variante seleccionada: "${selectedVariant}"`);
      
      // Wait for product page to update after variant change
      await page.waitForTimeout(1000);
    } else {
      console.log(`\n⏭️  Paso 1: Sin variante para seleccionar`);
    }
    
    await selectProductOptionsFromOrder(page, product, order, {
      log: (message) => console.log(message),
    });
    
    // Set delivery date from config (per-product or global)
    const deliveryDate = order.deliveryDate || orderConfig.deliveryDate;
    
    if (deliveryDate) {
      console.log(`\n📅 Paso 2: Seleccionando fecha de entrega...`);
      console.log(`  Fecha deseada: ${deliveryDate}${order.deliveryDate ? ' (per-product)' : ' (global)'}`);
      
      try {
        await selectDeliveryDate(page, deliveryDate, {
          environment: ENVIRONMENT,
          log: (message) => console.log(message),
        });
      } catch (e) {
        console.error(`\n❌ ERROR CRÍTICO DE FECHA:`);
        console.error(`  ${e.message}`);
        // Re-throw the error to stop the test immediately
        throw e;
      }
    } else {
      console.log(`\n⏭️  Paso 2: Sin fecha para seleccionar`);
    }
    
    console.log(`\n🔢 Seleccionando cantidad: ${order.quantity}`);
    const selectedQuantity = await setQuantityFromOrder(page, product, order);
    console.log(`  ✅ Cantidad seleccionada: ${selectedQuantity}`);

    console.log(`\n🛒 Esperando boton Add to Cart...`);
    const addToCartSelector = await clickAddToCart(page);
    console.log(`  ✅ Add to Cart presionado: ${addToCartSelector}`);
    // Wait for cart count to update (faster signal than waiting for full sidebar)
    await page.waitForSelector('#cart-sidebar-checkout, .halo-sidebar-close, a[data-close-cart-sidebar], .cart-count', { state: 'visible', timeout: 6000 }).catch(() => {});
    console.log(`\n🛒 Producto "${product.name}" agregado al carrito correctamente`);

    // Read every time: the token belongs to the cart, so the last read covers
    // every product the run added.
    cartToken = (await readCartToken(page)) ?? cartToken;

    
    // Close sidebar cart if not the last product
    if (i < orderConfig.orders.length - 1) {
      const closeButton = page.locator('.halo-sidebar-close, a[data-close-cart-sidebar]');
      const isVisible = await closeButton.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) {
        await closeButton.first().click();
        // Wait longer for sidebar close animation to complete
        await page.waitForTimeout(1500);
        // Verify sidebar is fully hidden (including backdrop)
        await page.locator('.halo-sidebar-wrapper, #cart-sidebar-wrapper, [data-cart-sidebar]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    }
  }

  await page.locator("#cart-sidebar-checkout").click();

  console.log('\n📋 Paso 3: Ingresando datos del cliente...');
  await page.locator("#email").click();
  await page.locator("div._9F1Rf").click();
  await page.locator("#email").fill(customer.email);

  await page
    .locator('input[name="firstName"]')
    .first()
    .fill(customer.firstName);
  await page.locator('input[name="lastName"]').first().fill(customer.lastName);
  await page.locator("#shipping-address1").fill(customer.address);
  await page.locator('input[name="city"]').first().fill(customer.city);

  await page.locator('select[name="countryCode"]').selectOption("US");
  await page.locator('select[name="zone"]').selectOption(customer.state);
  await page.locator('input[name="postalCode"]').first().fill(customer.zipCode);
  await page.locator('input[name="phone"]').first().fill(customer.phone);

  await page.locator("div.MV9Am button").click();
  await page.waitForSelector('button:has-text("Continue to payment")', { state: 'visible', timeout: 10000 });
  await page
    .locator("button")
    .filter({ hasText: "Continue to payment" })
    .first()
    .click();

  await page.waitForSelector('iframe', { state: 'attached', timeout: 10000 });

  console.log('\n💳 Paso 4: Ingresando datos de pago...');
  // Shopify card fields are in separate iframes - use Tab to navigate between them
  const cardFrame = page.frameLocator("iframe").first();

  const cardNumberInput = cardFrame.locator('input[data-current-field="number"]');
  await cardNumberInput.waitFor({ state: 'visible', timeout: 10000 });
  await cardNumberInput.click();
  await cardNumberInput.pressSequentially(payment.cardNumber, { delay: 100 });
  await page.waitForTimeout(500);
  // Tab to expiry field (next iframe)
  await cardNumberInput.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.type(payment.expiry, { delay: 100 });
  await page.waitForTimeout(500);
  // Tab to CVV field (next iframe)
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.type(payment.cvv, { delay: 100 });
  await page.waitForTimeout(500);

  console.log('\n🚀 Paso 5: Enviando orden...');

  /*
   * Noted before the redirect: the checkout lives at /checkouts/cn/{cartToken}/,
   * and that token is what the order is filed under. Once the browser moves to
   * the order-status page it is gone.
   */
  const checkoutUrl = page.url();

  try {
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /pay|complete|order/i })
      .first()
      .click();
  } catch (e) {
    console.log('⚠️  Could not click submit button, order may have been placed automatically');
  }

  /*
   * Wait for the browser to leave the payment step, not for a selector. The
   * selector list included h2:has-text("Order"), which the payment page's own
   * "Order summary" heading satisfies immediately — so a real run read its order
   * number off /checkouts/cn/…/payment, where there is none, and recorded an
   * order it had placed as uncaptured.
   */
  try {
    await page.waitForURL(/\/thank[-_]?you|\/orders\//, { timeout: 60000 });
    console.log(`  ✅ Confirmacion alcanzada`);
  } catch (e) {
    console.log('⚠️  El checkout no llego a la pagina de confirmacion dentro del tiempo');
  }

  // readCheckoutError never throws, so this throw cannot be swallowed by a
  // "browser may have closed" guard the way the previous inline version was.
  const checkoutError = await readCheckoutError(page);

  if (checkoutError) {
    await page
      .screenshot({
        path: `test-results/checkout-error-${Date.now()}.png`,
        fullPage: true,
      })
      .catch(() => {});
    throw new Error(`Checkout error detected: ${checkoutError}`);
  }

  try {
    const order = await captureOrder({
      page,
      lookup,
      correlationId,
      cartToken,
      checkoutUrl,
      since: runStartedAt,
      productTitles: orderConfig.orders
        .map((entry) => products.find((p) => p.id === entry.productId)?.name)
        .filter(Boolean),
    });

    const historyEntry = {
      orderNumber: order.orderNumber,
      confirmationNumber: order.confirmationNumber,
      orderId: order.id,
      statusUrl: order.statusUrl,
      adminUrl: order.adminUrl ?? null,
      date: new Date().toISOString(),
      environment: ENVIRONMENT,
      // What the run asked for. Kept because it carries the per-product delivery
      // dates, which the store does not report back.
      products: orderConfig.orders,
      // What the store actually charged for, which is not always the same thing.
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
      // Every entry ever written said 'N/A', because a browser that has closed
      // cannot be asked for a total. The store can.
      total: order.total ?? 'N/A',
      tags: order.tags ?? [],
      // How confidently the order was identified, so a weak match is never read
      // as a strong one.
      matchedBy: order.matchedBy ?? null,
      correlationId,
      // Where the number came from, so a scraped one is never mistaken for the
      // store's own answer.
      source: order.source,
    };

    /*
     * One insert. The file version read the whole history, pushed onto it and
     * wrote it back, so runs finishing together overwrote each other: five at
     * once left two entries.
     */
    await store.addOrderRun(historyEntry);

    console.log("✅ Order placed successfully! Order #:", order.orderNumber || "(not captured)");
  } catch (error) {
    console.log(
      "⚠️  Order may have been placed but could not capture order number:",
      error.message,
    );
  }
});
