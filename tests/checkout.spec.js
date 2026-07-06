const { test, expect } = require("@playwright/test");

test("Recording 2/10/2026 at 8:11:15 AM", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 539 });
  await page.goto(
    "https://bloom-brain-dev.myshopify.com/products/floreana-white-spray-roses-1",
  );
  await page.locator("tr:nth-of-type(3) > td:nth-of-type(6) > button").click();
  await page.locator("#quantity-8293790941324-2").selectOption("4");
  await page.locator("#product-add-to-cart").click();
  await page.waitForTimeout(2000);
  await page.locator("#cart-sidebar-checkout").click();

  await page.locator("#email").click();
  await page.locator("div._9F1Rf").click();
  await page.locator("#email").fill("jose@fiftyflowers.com");

  await page.locator('input[name="firstName"]').first().fill("Jose");
  await page.locator('input[name="lastName"]').first().fill("Testing");
  await page.locator("#shipping-address1").fill("179 Wall St");
  await page.locator('input[name="city"]').first().fill("West Long Branch");

  await page.locator('select[name="countryCode"]').selectOption("US");
  await page.locator('select[name="zone"]').selectOption("NJ");
  await page.locator('input[name="postalCode"]').first().fill("07764");

  await page.locator('input[name="phone"]').first().fill("(208) 391-2924");

  await page.waitForTimeout(2000); // Wait for validation
  await page.locator("div.MV9Am button").click();
  await page.waitForTimeout(2000); // Wait for navigation
  await page
    .locator("button")
    .filter({ hasText: "Continue to payment" })
    .first()
    .click();

  await page.waitForTimeout(2000); // Wait for navigation

  // Shopify card fields are often in iframes - try multiple selectors
  const cardFrame = page.frameLocator('iframe').first();
  
  await cardFrame.locator('input[data-current-field="number"]').fill("1");
  await cardFrame.locator('input[data-current-field="number"]').press('Tab');
  await page.keyboard.type("1226");
  await page.keyboard.press('Tab');
  await page.keyboard.type("123");
  
  await page.locator('button[type="submit"]').filter({ hasText: /pay|complete|order/i }).first().click();
});
