const { test, expect } = require("@playwright/test");
const {
  clickAddToCart,
  selectDeliveryDate,
  selectProductOptionsFromOrder,
  selectVariantFromOrder,
  setQuantityFromOrder,
} = require("./helpers/product-form");

test("selects peach sorbet variant tiles from full order variant text", async ({ page }) => {
  await page.setContent(`
    <style>
      .ff-variant-tiles__radio {
        position: absolute;
        opacity: 0;
      }
    </style>
    <variant-radios>
      <input
        class="ff-variant-tiles__radio"
        type="radio"
        id="small"
        name="Variants"
        value="Small Package"
        data-variant-title="Small Package"
        data-stem-count="111"
        data-price="$269.99"
        checked
      >
      <label class="ff-variant-tiles__tile" for="small">
        <span>Small Package</span><span>111 Stems</span><span>$269.99</span>
      </label>
      <input
        class="ff-variant-tiles__radio"
        type="radio"
        id="medium"
        name="Variants"
        value="Medium Package"
        data-variant-title="Medium Package"
        data-stem-count="230"
        data-price="$449.99"
      >
      <label class="ff-variant-tiles__tile" for="medium">
        <span>Medium Package</span><span>230 Stems</span><span>$449.99</span>
      </label>
      <input
        class="ff-variant-tiles__radio"
        type="radio"
        id="large"
        name="Variants"
        value="Large Package"
        data-variant-title="Large Package"
        data-stem-count="351"
        data-price="$674.99"
      >
      <label class="ff-variant-tiles__tile" for="large">
        <span>Large Package</span><span>351 Stems</span><span>$674.99</span>
      </label>
    </variant-radios>
  `);

  await selectVariantFromOrder(
    page,
    { variantSelector: 'variant-radios input[name="Variants"]' },
    { variant: "Medium Package 230 Stems $449.99" },
  );

  await expect(page.locator("#medium")).toBeChecked();
});

test("keeps regular select variant and quantity controls working", async ({ page }) => {
  await page.setContent(`
    <select id="option-0">
      <option value="25 Roses">25 Roses (Please allow 5 Business days for delivery)</option>
      <option value="50 Roses">50 Roses</option>
    </select>
    <select id="quantity-select" name="quantity">
      <option value="1">1</option>
      <option value="4">4</option>
    </select>
  `);

  await selectVariantFromOrder(
    page,
    { variantSelector: "#option-0" },
    { variant: "25 Roses (Please allow 5 Business days for delivery)" },
  );
  await setQuantityFromOrder(
    page,
    { name: "Roses", quantitySelector: "#quantity-select" },
    { quantity: 4 },
  );

  await expect(page.locator("#option-0")).toHaveValue("25 Roses");
  await expect(page.locator("#quantity-select")).toHaveValue("4");
});

test("loads the selected Shopify variant URL for non-default variants", async ({ page }) => {
  await page.route("https://example.test/products/test-flower**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const variantId = requestUrl.searchParams.get("variant") || "111";
    const selectedValue = variantId === "222" ? "144 Garden Roses" : "24 Garden Roses";

    await route.fulfill({
      contentType: "text/html",
      body: `
        <form action="/cart/add" method="post">
          <input type="hidden" name="id" value="${variantId}">
          <select id="option-0">
            <option value="24 Garden Roses"${selectedValue === "24 Garden Roses" ? " selected" : ""}>24 Garden Roses - $154.99</option>
            <option value="144 Garden Roses"${selectedValue === "144 Garden Roses" ? " selected" : ""}>144 Garden Roses - $624.99</option>
          </select>
        </form>
        <script>
          const variantIds = {
            "24 Garden Roses": "111",
            "144 Garden Roses": "222",
          };
          document.querySelector("#option-0").addEventListener("change", (event) => {
            document.querySelector('input[name="id"]').value = variantIds[event.target.value];
          });
        </script>
      `,
    });
  });

  await page.goto("https://example.test/products/test-flower");

  await selectVariantFromOrder(
    page,
    {
      variantSelector: "#option-0",
      defaultVariant: "24 Garden Roses - $154.99",
    },
    { variant: "144 Garden Roses - $624.99" },
  );

  await expect(page).toHaveURL(/variant=222/);
  await expect(page.locator("#option-0")).toHaveValue("144 Garden Roses");
});

test("selects product options from order data using stable option names", async ({ page }) => {
  await page.setContent(`
    <label for="mini-calla-bunch-1">Mini Callas Bunch 1</label>
    <button type="button" role="combobox" id="mini-calla-bunch-1">White</button>
    <select name="vo_0_24804">
      <option value="White">White</option>
      <option value="Enhanced Orange">Enhanced OrangeAdd $19.00</option>
      <option value="Peach">Peach</option>
    </select>
    <input
      type="hidden"
      name="hidden-vo_0_24804"
      value='{"label":"Mini Callas Bunch 1","variantOptionId":"vo_0_24804","value":"White"}'
    >
    <script>
      const select = document.querySelector('select[name="vo_0_24804"]');
      const button = document.querySelector("#mini-calla-bunch-1");
      const hidden = document.querySelector('input[name="hidden-vo_0_24804"]');
      select.addEventListener('change', () => {
        button.textContent = select.value;
        hidden.value = JSON.stringify({
          label: 'Mini Callas Bunch 1',
          variantOptionId: 'vo_0_24804',
          value: select.value,
        });
      });
    </script>
  `);

  await selectProductOptionsFromOrder(
    page,
    {
      type: "product-options",
      productOptions: [
        {
          id: "vo_0_24804",
          label: "Mini Callas Bunch 1",
          selector: "select[name=\"vo_0_24804\"]",
          options: [
            "White",
            {
              value: "Enhanced Orange",
              label: "Enhanced Orange Add $19.00",
              price: 19,
            },
            "Peach",
          ],
          defaultValue: "White",
        },
      ],
    },
    {
      productOptions: {
        vo_0_24804: "Enhanced Orange Add $19.00",
      },
    },
  );

  await expect(page.locator('select[name="vo_0_24804"]')).toHaveValue("Enhanced Orange");
  await expect(page.locator("#mini-calla-bunch-1")).toHaveText("Enhanced Orange");
  await expect(page.locator('input[name="hidden-vo_0_24804"]')).toHaveValue(/"value":"Enhanced Orange"/);
});

test("sets quantity on number inputs used by the new DIY template", async ({ page }) => {
  await page.setContent(`
    <input
      class="form-input quantity__input"
      type="number"
      name="quantity"
      id="quantity-9601477836940-2"
      value="1"
      min="1"
    >
    <script>
      window.quantityEvents = [];
      const input = document.querySelector('input[name="quantity"]');
      input.addEventListener('input', () => window.quantityEvents.push('input'));
      input.addEventListener('change', () => window.quantityEvents.push('change'));
    </script>
  `);

  await setQuantityFromOrder(
    page,
    { name: "Peach Sorbet DIY Flower Kit", quantitySelector: "#quantity-9601477836940-2" },
    { quantity: 3 },
  );

  await expect(page.locator("#quantity-9601477836940-2")).toHaveValue("3");
  const events = await page.evaluate(() => window.quantityEvents);
  expect(events).toContain("input");
  expect(events).toContain("change");
});

test("selects the visible available calendar day when duplicate day buttons exist", async ({ page }) => {
  await page.setContent(`
    <div data-ff-product-calendar calendar-location="product-template">
      <button type="button" role="combobox">August</button>
      <button type="button" role="combobox">2026</button>
      <div class="calendar-container">
        <button type="button" name="day" class="!cursor-not-allowed !pointer-events-none">27, unavailable</button>
        <button type="button" name="day" id="available-27">27</button>
        <input type="hidden" name="delivery_date_input" value="">
      </div>
    </div>
    <script>
      window.clickedDay = null;
      document.querySelector("#available-27").addEventListener("click", () => {
        window.clickedDay = "27";
        document.querySelector('input[name="delivery_date_input"]').value = "08/27/2026";
      });
    </script>
  `);

  await selectDeliveryDate(page, "2026-08-27");

  await expect.poll(() => page.evaluate(() => window.clickedDay)).toBe("27");
  await expect(page.locator('input[name="delivery_date_input"]')).toHaveValue("08/27/2026");
});

test("waits for delayed add to cart button before clicking", async ({ page }) => {
  await page.setContent(`
    <script>
      window.addClicked = false;
      setTimeout(() => {
        const button = document.createElement('button');
        button.id = 'product-add-to-cart';
        button.textContent = 'Add to cart';
        button.addEventListener('click', () => {
          window.addClicked = true;
        });
        document.body.appendChild(button);
      }, 300);
    </script>
  `);

  const selector = await clickAddToCart(page, { timeout: 5000 });

  expect(selector).toBe("#product-add-to-cart");
  await expect.poll(() => page.evaluate(() => window.addClicked)).toBe(true);
});

test("unblocks Shopify add button when delivery date input already has a value", async ({ page }) => {
  await page.setContent(`
    <input id="isGiftCard" value="false">
    <input id="is_subscription" value="0">
    <div data-ff-product-calendar calendar-location="product-template">
      <input type="hidden" name="delivery_date_input" value="08/26/2026">
    </div>
    <form action="/cart/add">
      <button
        type="submit"
        name="add"
        id="product-add-to-cart"
        aria-disabled="true"
        aria-describedby="product-add-to-cart-hint"
      >
        Add To Cart
      </button>
    </form>
    <script>
      window.addClicked = false;
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
      });
      document.querySelector("#product-add-to-cart").addEventListener("click", () => {
        window.addClicked = true;
      });
    </script>
  `);

  const selector = await clickAddToCart(page, { timeout: 1000 });

  expect(selector).toBe("#product-add-to-cart");
  await expect(page.locator("#product-add-to-cart")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#product-add-to-cart")).not.toHaveAttribute("aria-describedby", "product-add-to-cart-hint");
  await expect.poll(() => page.evaluate(() => window.addClicked)).toBe(true);
});
