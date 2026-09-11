const { test } = require("@playwright/test");
const { clickAddToCart } = require("./helpers/product-form");
const store = require("../lib/store");
const { disconnect } = require("../lib/db");

const PRODUCT_ID = "wedding-flower-kit";
/** Looks a product up in the store, which is where the catalogue lives now. */
async function loadProduct(slug) {
  const products = await store.getProducts('dev');
  const product = products.find((candidate) => candidate.id === slug);
  if (!product) throw new Error(`Product not found: ${slug}`);
  return product;
}

test.afterAll(async () => {
  await disconnect();
});

test("wedding: product-options (debug)", async ({ page }) => {
  const product = await loadProduct(PRODUCT_ID);
  const orderConfig = await store.getOrderConfig('dev');

  // Open product page
  await page.goto(product.url);
  await page.waitForLoadState('networkidle');

  // Close sidecart if it's open from previous action
  const sidebarClose = page.locator('.halo-sidebar-close, a[data-close-cart-sidebar]');
  await page.waitForTimeout(1000); 
  const isSidebarOpen = await sidebarClose.first().isVisible({ timeout: 1000 }).catch(() => false);
  if (isSidebarOpen) {
    console.log('🔄 Closing open cart sidebar...');
    await sidebarClose.first().click();
    await page.waitForTimeout(1000);
    console.log('✅ Cart sidebar closed');
  }

  // helper for interacting with either a <select> or a Radix-style combobox
  async function chooseOption(selector, value) {
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const tagName = await locator.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await locator.selectOption({ label: value });
    } else {
      await locator.click();
      const option = page.locator("role=option", { hasText: value });
      await option.waitFor({ state: "visible", timeout: 5000 });
      await option.click();
    }
    await page.waitForTimeout(1000);
  }

  const greenerySelector = "#\\:r6\\:-form-item";
  const heartygreenerySelector = "#\\:r9\\:-form-item";
  const threeHundredCarnationsColorSelector = "#\\:rc\\:-form-item";
  const tenFillerFlowerBunshesSelector = "#\\:rf\\:-form-item";
  const oneHundredRoseColorSelector = "#\\:ri\\:-form-item";

  // Select variant (if present) — use helper to handle either element type
  await chooseOption(greenerySelector, "Lily Grass Green 25 Shoots per Bunch");
  await chooseOption(
    heartygreenerySelector,
    "Eucalyptus baby 5-8 Stem Bunches",
  );
  await chooseOption(threeHundredCarnationsColorSelector, "Cream");
  await chooseOption(
    tenFillerFlowerBunshesSelector,
    "Pink Medium Lisianthus 10 Stem Bunches",
  );
  await chooseOption(
    oneHundredRoseColorSelector,
    "Creamy White",
  );

  if (product.variantSelector && product.defaultVariant) {
    await page.waitForSelector(product.variantSelector, {
      state: "visible",
      timeout: 5000,
    });
    // prefer selecting by value (DOM option value is "Wedding Combo Box")
    await page
      .selectOption(product.variantSelector, product.defaultVariant)
      .catch(async () => {
        await page
          .selectOption(product.variantSelector, {
            label: product.defaultVariant,
          })
          .catch(() => {
            console.log(
              "⚠ Could not select variant",
              product.variantSelector,
              product.defaultVariant,
            );
          });
      });
    await page.waitForTimeout(500);
  }

  const qtyLocator = page.locator(product.quantitySelector);
  const tagName = await qtyLocator.evaluate((el) => el.tagName.toLowerCase());
  if (tagName === "select") {
    await qtyLocator.selectOption(String(product.defaultQuantity ?? 1));
  } else {
    await qtyLocator.fill(String(product.defaultQuantity ?? 1));
  }

    // Set delivery date from config (per-product or global)
    const order = orderConfig.orders?.find(o => o.productId === PRODUCT_ID);
    const deliveryDate = order?.deliveryDate || orderConfig.deliveryDate;
    
    if (deliveryDate) {
      console.log(`\n📅 Setting delivery date: ${deliveryDate}${order?.deliveryDate ? ' (per-product)' : ' (global)'}`);
      
      try {
        await page.waitForTimeout(1000);
        
        // Try method 1: Direct input[type="date"]
        const dateInput = page.locator('input[type="date"]').first();
        const dateInputExists = await dateInput.count() > 0;
        
        console.log(`  Looking for input[type="date"]: ${dateInputExists ? 'FOUND' : 'NOT FOUND'}`);
        
        if (dateInputExists) {
          console.log(`  → Using direct input method`);
          await dateInput.fill(deliveryDate);
          await page.waitForTimeout(500);
          await dateInput.dispatchEvent('change');
          await page.waitForTimeout(500);
          console.log(`  ✅ Date set: ${deliveryDate}`);
        } else {
          // Method 2: Calendar with month/day selection
          console.log(`  → Using calendar method`);
          
          const [year, month, day] = deliveryDate.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = monthNames[parseInt(month, 10) - 1];
          const dayNumber = parseInt(day, 10);
          
          console.log(`  Navigating to: ${monthName} ${dayNumber}, ${year}`);
          
          // Check if we need to change the month
          // Target the Radix UI combobox that displays the current month name
          const monthButton = page.locator('button[role="combobox"]').filter({ hasText: /january|february|march|april|may|june|july|august|september|october|november|december/i }).first();
          const monthButtonCount = await monthButton.count();
          console.log(`  Looking for month button: ${monthButtonCount > 0 ? 'FOUND' : 'NOT FOUND'}`);
          
          let needsMonthChange = true;
          
          if (monthButtonCount > 0) {
            const monthButtonText = await monthButton.first().textContent();
            const currentMonth = monthButtonText?.trim();
            console.log(`    Current month showing: "${currentMonth}"`);
            
            // Check if the calendar is already showing the correct month
            if (currentMonth === monthName) {
              console.log(`    ✓ Calendar already on ${monthName}, skipping month selection`);
              needsMonthChange = false;
            } else {
              console.log(`    Need to change from "${currentMonth}" to "${monthName}"`);
              console.log(`    Clicking month button...`);
              await monthButton.first().click();
              await page.waitForTimeout(1000);
              console.log(`    ✓ Click done, looking for "${monthName}"...`);
              
              // Find and click the month option in the Radix dropdown
              let monthOption = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${monthName}$`, 'i') }).first();
              let monthOptionCount = await monthOption.count();
              
              console.log(`    Looking for "${monthName}": ${monthOptionCount > 0 ? 'FOUND' : 'NOT FOUND'}`);
              
              if (monthOptionCount > 0) {
                console.log(`    Clicking "${monthName}"...`);
                await monthOption.click();
                await page.waitForTimeout(1000);
                console.log(`    ✅ Month "${monthName}" selected`);
              } else {
                console.log(`    ❌ Month option "${monthName}" not found`);
              }
            }
            
            // Find and click the day (regardless of whether we changed the month)
            console.log(`  Looking for day ${dayNumber}...`);
            
            const dayButton = page.locator(`.calendar-container button[name="day"]`).filter({ hasText: new RegExp(`^${dayNumber}$`) }).first();
            const dayButtonCount = await dayButton.count();
            
            console.log(`    Day ${dayNumber}: ${dayButtonCount > 0 ? 'FOUND' : 'NOT FOUND'}`);
            
            if (dayButtonCount > 0) {
              // Check if button is disabled
              const isDisabled = await dayButton.getAttribute('disabled');
              console.log(`    Button state: ${isDisabled !== null ? 'DISABLED' : 'ENABLED'}`);
              
              if (isDisabled !== null) {
                console.log(`    ⚠️  Day ${dayNumber} is disabled, trying force click...`);
                try {
                  await dayButton.click({ force: true });
                  await page.waitForTimeout(500);
                  console.log(`    ✅ Force clicked day ${dayNumber}`);
                } catch (e) {
                  console.log(`    ❌ Could not force click: ${e.message}`);
                }
              } else {
                console.log(`    Clicking day ${dayNumber}...`);
                await dayButton.click();
                await page.waitForTimeout(500);
                console.log(`    ✅ Day ${dayNumber} selected`);
              }
            } else {
              console.log(`    ❌ Day ${dayNumber} not found`);
            }
          } else {
            console.log(`  ❌ Month button not found`);
          }
        }
      } catch (e) {
        console.error(`  ❌ Error setting delivery date: ${e.message}`);
      }
    }

    // Add to cart
  console.log('\n🛒 Adding to cart...');
  const addToCartSelector = await clickAddToCart(page);
  await page.waitForTimeout(2000); // Wait for add to cart animation
  console.log(`✅ Clicked add to cart button: ${addToCartSelector}`);


});
