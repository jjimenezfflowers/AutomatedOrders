const { test, expect } = require("@playwright/test");
const {
  clickAddToCart,
  escapeRegExp,
  findAvailableDeliveryDays,
  MONTH_NAMES,
  selectDeliveryDate,
  selectProductOptionsFromOrder,
  selectVariantFromOrder,
  setQuantityFromOrder,
} = require("./helpers/product-form");
const products = require("../products.json");

const PRODUCT_ID = "choose-your-color-mini-calla-lilies";
const product = products.find((p) => p.id === PRODUCT_ID);

const order = {
  productId: PRODUCT_ID,
  quantity: 2,
  variant: "50 Stems (5 Bunches) - $179.99",
  productOptions: {
    vo_0_24804: "Peach",
    vo_1_24805: "Blush",
    vo_2_24806: "Lavender/Purple",
    vo_3_24807: "Enhanced Orange Add $19.00",
    vo_4_24808: "Cream/Off-White",
  },
};

// Looks a couple of months ahead for a day the storefront will accept.
async function pickAvailableDeliveryDate(page, monthsToTry = 3) {
  const today = new Date();

  for (let offset = 0; offset < monthsToTry; offset++) {
    const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const month = MONTH_NAMES[cursor.getMonth()];
    const year = cursor.getFullYear();

    const days = await findAvailableDeliveryDays(page, { month, year, timeout: 15000 });
    // Skip days that have already passed in the current month.
    const usable = offset === 0 ? days.filter((day) => day > today.getDate()) : days;

    if (usable.length > 0) {
      const day = String(usable[0]).padStart(2, "0");
      return `${year}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${day}`;
    }
  }

  throw new Error(`No hay fechas de entrega disponibles en los proximos ${monthsToTry} meses`);
}

test("mini calla: product-options add to cart", async ({ page }) => {
  if (!product) throw new Error(`Product not found: ${PRODUCT_ID}`);

  await page.goto(product.url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  const sidebarClose = page.locator(".halo-sidebar-close, a[data-close-cart-sidebar]");
  const isSidebarOpen = await sidebarClose.first().isVisible({ timeout: 2000 }).catch(() => false);
  if (isSidebarOpen) {
    await sidebarClose.first().click();
    await page
      .locator(".halo-sidebar-wrapper, #cart-sidebar-wrapper, [data-cart-sidebar]")
      .waitFor({ state: "hidden", timeout: 3000 })
      .catch(() => {});
  }

  await selectVariantFromOrder(page, product, order);
  await selectProductOptionsFromOrder(page, product, order, {
    log: (message) => console.log(message),
  });

  for (const [optionId, expectedValue] of Object.entries({
    vo_0_24804: "Peach",
    vo_1_24805: "Blush",
    vo_2_24806: "Lavender/Purple",
    vo_3_24807: "Enhanced Orange",
    vo_4_24808: "Cream/Off-White",
  })) {
    await expect(page.locator(`select[name="${optionId}"]`)).toHaveValue(expectedValue);
    await expect(page.locator(`input[name="hidden-${optionId}"]`)).toHaveValue(
      new RegExp(`"value":"${escapeRegExp(expectedValue)}"`),
    );
  }

  // Pinning an absolute date makes this spec expire: it used to hardcode a date
  // that was only valid on the day it was written. Ask the storefront instead.
  const deliveryDate = await pickAvailableDeliveryDate(page);
  console.log(`📅 Fecha de entrega elegida: ${deliveryDate}`);

  await selectDeliveryDate(page, deliveryDate, {
    environment: "dev",
    log: (message) => console.log(message),
  });

  await setQuantityFromOrder(page, product, order);
  await expect(page.locator(product.quantitySelector)).toHaveValue(String(order.quantity));

  await clickAddToCart(page);
  await page.waitForSelector(
    "#cart-sidebar-checkout, .halo-sidebar-close, a[data-close-cart-sidebar], .cart-count",
    { state: "visible", timeout: 10000 },
  );
});
