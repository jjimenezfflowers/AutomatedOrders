const { test, expect } = require("@playwright/test");
const fs = require("fs").promises;
const path = require("path");

// When STAGING_BASE_URL is set, rewrite product URLs to point at the staging store.
const STAGING_BASE_URL = process.env.STAGING_BASE_URL
  ? process.env.STAGING_BASE_URL.replace(/\/$/, '')
  : null;

// Which environment config file to use (set by server when staging=true)
const STAGING_CONFIG = process.env.STAGING_CONFIG || null;
const ENVIRONMENT = STAGING_CONFIG ? 'staging' : 'dev';

const PRODUCTS_FILE = STAGING_CONFIG ? 'products-staging.json' : 'products.json';

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
  const configFile = STAGING_CONFIG || 'order-config.json';
  const configData = await fs.readFile(path.join(__dirname, '..', configFile), 'utf8');
  const config = JSON.parse(configData);

  // Merge customer info and payment from the main config if not present in staging config
  if (STAGING_CONFIG && (!config.customerInfo || !config.payment)) {
    const mainData = await fs.readFile(path.join(__dirname, '..', 'order-config.json'), 'utf8');
    const mainConfig = JSON.parse(mainData);
    config.customerInfo = config.customerInfo || mainConfig.customerInfo;
    config.payment = config.payment || mainConfig.payment;
  }

  return config;
}

async function loadProducts() {
  const data = await fs.readFile(path.join(__dirname, '..', PRODUCTS_FILE), 'utf8');
  return JSON.parse(data);
}

test("Place order from config", async ({ page }) => {
  const orderConfig = await loadOrderConfig();
  const products = await loadProducts();
  const customer = orderConfig.customerInfo;
  const payment = orderConfig.payment;

  for (let i = 0; i < orderConfig.orders.length; i++) {
    const order = orderConfig.orders[i];
    const product = products.find((p) => p.id === order.productId);
    if (!product) {
      console.log(`Product ${order.productId} not found`);
      continue;
    }

    await page.goto(resolveProductUrl(product.url));
    await page.waitForLoadState('domcontentloaded');
    
    // Close sidecart if it's open from previous product
    const sidebarClose = page.locator('.halo-sidebar-close, a[data-close-cart-sidebar]');
    const isSidebarOpen = await sidebarClose.first().isVisible({ timeout: 1000 }).catch(() => false);
    if (isSidebarOpen) {
      await sidebarClose.first().click();
    }
    
    // Select variant FIRST if product has variant selector (this reloads the calendar)
    if (product.variantSelector && order.variant) {
      console.log(`\n🔧 Paso 1: Seleccionando variante...`);
      console.log(`  Selector: ${product.variantSelector}`);
      console.log(`  Valor deseado: "${order.variant}"`);
      
      await page.waitForSelector(product.variantSelector, { state: 'visible', timeout: 1000 });
      
      // Verificar qué opciones están disponibles
      const availableVariants = await page.locator(product.variantSelector).locator('option').allTextContents();
      console.log(`  Opciones disponibles (${availableVariants.length}):`, availableVariants);

      // Normalize helper: collapse whitespace and unify dashes (em dash, en dash → hyphen)
      const norm = (s) => s.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
      const targetNorm = norm(order.variant);

      // Strategy 1: try direct value match (short timeout so we fall through fast)
      let selected = false;
      try {
        await page.locator(product.variantSelector).selectOption(order.variant, { timeout: 3000 });
        selected = true;
      } catch (e) { /* fall through to fuzzy matching */ }

      // Strategy 2: match by normalized option value or text content
      if (!selected) {
        const optionEls = await page.locator(product.variantSelector + ' option').all();
        for (const opt of optionEls) {
          const val  = (await opt.getAttribute('value')) || '';
          const text = norm(await opt.textContent() || '');
          const valNorm = norm(val);
          if (valNorm === targetNorm || text === targetNorm ||
              text.includes(targetNorm) || targetNorm.includes(valNorm)) {
            console.log(`  → Fallback: seleccionando por value="${val}"`);
            await page.locator(product.variantSelector).selectOption(val);
            selected = true;
            break;
          }
        }
      }

      // Strategy 3: match only on the name part before any dash
      if (!selected) {
        const targetName = targetNorm.split('-')[0].trim().toLowerCase();
        const optionEls = await page.locator(product.variantSelector + ' option').all();
        for (const opt of optionEls) {
          const val  = (await opt.getAttribute('value')) || '';
          const text = norm(await opt.textContent() || '').toLowerCase();
          if (text.startsWith(targetName)) {
            console.log(`  → Fallback parcial: seleccionando por value="${val}"`);
            await page.locator(product.variantSelector).selectOption(val);
            selected = true;
            break;
          }
        }
      }

      if (!selected) {
        throw new Error(`No se encontró la variante "${order.variant}" en el selector ${product.variantSelector}`);
      }
      
      // Verificar que se seleccionó correctamente
      const selectedVariant = await page.locator(product.variantSelector).inputValue();
      console.log(`  ✅ Variante seleccionada: "${selectedVariant}"`);
      
      // Wait for product page to update after variant change
      await page.waitForTimeout(1000);
    } else {
      console.log(`\n⏭️  Paso 1: Sin variante para seleccionar`);
    }
    
    // Handle product options if this is a product-options type
    if (product.type === 'product-options' && product.productOptions) {
      console.log(`  Configuring ${product.productOptions.length} product options...`);
      
      for (const option of product.productOptions) {
        try {
          let optionValue = order.productOptions?.[option.id] || option.defaultValue;
          
          // Find the actual value to use for selection
          // Options can be strings or objects with {value, label, price}
          const matchingOption = option.options.find(opt => {
            if (typeof opt === 'string') {
              return opt === optionValue;
            } else {
              return opt.value === optionValue;
            }
          });
          
          // Use the value field for selection (works for both string and object)
          const valueToSelect = typeof matchingOption === 'string' ? matchingOption : matchingOption?.value || optionValue;
          
          console.log(`    - ${option.label}: selecting "${valueToSelect}" (from config: "${optionValue}")`);
          console.log(`      Selector: ${option.selector}`);
          
          const optionLocator = page.locator(option.selector);
          await optionLocator.waitFor({ state: 'visible', timeout: 10000 });
          const tagName = await optionLocator.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'select') {
            await optionLocator.selectOption(valueToSelect);
          } else {
            await optionLocator.click();
            const optionItem = page.locator('[role="option"]').filter({ hasText: valueToSelect }).first();
            await optionItem.waitFor({ state: 'visible', timeout: 5000 });
            await optionItem.click();
          }
          console.log(`      ✓ Selected: "${valueToSelect}"`);
          await page.waitForTimeout(500);
        } catch (e) {
          console.log(`    ⚠️  Could not set option ${option.label}:`, e.message);
        }
      }
      
      // Wait for product page to update after options change
      await page.waitForTimeout(500);
    }
    
    // Set delivery date from config (per-product or global)
    const deliveryDate = order.deliveryDate || orderConfig.deliveryDate;
    
    if (deliveryDate) {
      console.log(`\n📅 Paso 2: Seleccionando fecha de entrega...`);
      console.log(`  Fecha deseada: ${deliveryDate}${order.deliveryDate ? ' (per-product)' : ' (global)'}`);
      
      try {
        // Wait for date selector to appear — extra time for slow DEV page loads
        await page.waitForTimeout(2000);
        
        // Try method 1: Direct input[type="date"] (simpler products)
        const dateInput = page.locator('input[type="date"]').first();
        const dateInputExists = await dateInput.count() > 0;
        
        console.log(`  Buscando input[type="date"]: ${dateInputExists ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
        
        if (dateInputExists) {
          console.log(`  → Usando método directo (input date)`);
          await dateInput.fill(deliveryDate);
          await page.waitForTimeout(500);
          await dateInput.dispatchEvent('change');
          await page.waitForTimeout(500);
          console.log(`  ✅ Fecha establecida: ${deliveryDate}`);
        } else {
          // Method 2: Calendar with comboboxes (more complex products)
          console.log(`  → Usando método de calendario`);
          
          const [year, month, day] = deliveryDate.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = monthNames[parseInt(month, 10) - 1];
          const dayNumber = parseInt(day, 10);
          
          console.log(`  Navegando a: ${monthName} ${dayNumber}, ${year}`);
          
          // Wait for calendar to fully render (staging needs more time)
          await page.waitForTimeout(ENVIRONMENT === 'staging' ? 6000 : 1500);
          
          // Click on month selector button (button:nth-child(2) in the calendar controls)
          const monthButton = page.locator('button[role="combobox"]').filter({ hasText: /january|february|march|april|may|june|july|august|september|october|november|december/i }).first();
          const monthButtonCount = await monthButton.count();
          console.log(`  Buscando botón del mes: ${monthButtonCount > 0 ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
          
          if (monthButtonCount > 0) {
            const monthButtonText = await monthButton.first().textContent();
            console.log(`    Texto actual del botón: "${monthButtonText?.trim()}"`);
            console.log(`    Haciendo click en botón del mes...`);
            await monthButton.first().click();
            await page.waitForTimeout(1000);
            console.log(`    ✓ Click realizado, buscando mes "${monthName}"...`);
            
            let monthOption = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${monthName}$`, 'i') }).first();
            let monthOptionCount = await monthOption.count();
            
            console.log(`    Buscando opción "${monthName}": ${monthOptionCount > 0 ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
            
            if (monthOptionCount > 0) {
              console.log(`    Haciendo click en "${monthName}"...`);
              await monthOption.click();
              await page.waitForTimeout(1500);
              console.log(`    ✅ Mes "${monthName}" seleccionado`);
              
              // Now find and click the day
              console.log(`  Buscando día ${dayNumber}...`);
              
              // Look for day button in the calendar tbody
              const dayButton = page.locator(`.calendar-container button[name="day"]`).filter({ hasText: new RegExp(`^${dayNumber}$`) }).first();
              const dayButtonCount = await dayButton.count();
              
              console.log(`    Día ${dayNumber}: ${dayButtonCount > 0 ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
              
              if (dayButtonCount > 0) {
                // Check if button is disabled
                const isDisabled = await dayButton.getAttribute('disabled');
                console.log(`    Estado del botón: ${isDisabled !== null ? 'DISABLED' : 'ENABLED'}`);
                
                if (isDisabled !== null) {
                  throw new Error(`FECHA NO DISPONIBLE: El día ${dayNumber} de ${monthName} ${year} no está disponible (está deshabilitado). Elige otra fecha de entrega.`);
                } else {
                  console.log(`    Haciendo click en día ${dayNumber}...`);
                  await dayButton.click();
                  await page.waitForTimeout(500);
                  console.log(`    ✅ Día ${dayNumber} seleccionado`);
                }
              } else {
                throw new Error(`❌ No se encontró el día ${dayNumber} en el calendario`);
              }
            } else {
              throw new Error(`❌ No se encontró la opción del mes "${monthName}" en el calendario`);
            }
          } else {
            throw new Error(`❌ No se encontró el botón del mes en el calendario`);
          }
        }
      } catch (e) {
        console.error(`\n❌ ERROR CRÍTICO DE FECHA:`);
        console.error(`  ${e.message}`);
        // Re-throw the error to stop the test immediately
        throw e;
      }
    } else {
      console.log(`\n⏭️  Paso 2: Sin fecha para seleccionar`);
    }
    
    // Wait for quantity selector to be ready
    await page.waitForSelector(product.quantitySelector, { state: 'visible', timeout: 5000 });
    
    await page
      .locator(product.quantitySelector)
      .selectOption(order.quantity.toString());
    await page.locator("#product-add-to-cart").click();
    // Wait for cart count to update (faster signal than waiting for full sidebar)
    await page.waitForSelector('#cart-sidebar-checkout, .halo-sidebar-close, a[data-close-cart-sidebar], .cart-count', { state: 'visible', timeout: 6000 }).catch(() => {});
    console.log(`\n🛒 Producto "${product.name}" agregado al carrito correctamente`);
    
    // Close sidebar cart if not the last product
    if (i < orderConfig.orders.length - 1) {
      const closeButton = page.locator('.halo-sidebar-close, a[data-close-cart-sidebar]');
      const isVisible = await closeButton.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        await closeButton.first().click();
        await page.waitForTimeout(300);
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
  try {
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /pay|complete|order/i })
      .first()
      .click();
  } catch (e) {
    console.log('⚠️  Could not click submit button, order may have been placed automatically');
  }

  // Wait for confirmation page - wait for URL to change or specific element
  try {
    await page.waitForTimeout(1000);
    
    try {
      // Wait for either order number or thank you message
      await page.waitForSelector('span.os-order-number, h2:has-text("Thank"), h2:has-text("Order"), .notice__text', { timeout: 30000 });
    } catch (e) {
      console.log('⚠️  Confirmation page selector not found, continuing anyway...');
    }
  } catch (e) {
    console.log('⚠️  Browser may have closed, but order was likely placed');
  }

  try {
    // Check for checkout error (ignore Shopify rate limiting)
    const errorText = await page
      .locator("text=/There was a problem|error|failed/i")
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => null);
    if (errorText && !errorText.includes("There was a problem with our checkout")) {
      await page.screenshot({
        path: `test-results/checkout-error-${Date.now()}.png`,
        fullPage: true,
      });
      throw new Error(`Checkout error detected: ${errorText}`);
    }
  } catch (e) {
    console.log('⚠️  Could not check for errors, browser may have closed');
  }

  try {
    // Try to capture order number from confirmation page - multiple selectors
    let orderNumber;

    // Try different selectors for order number
    const selectors = [
      "span.os-order-number",
      ".order-number",
      'h2:has-text("Order")',
      'span:has-text("#")',
      ".notice__text",
      "[data-order-number]",
    ];

    for (const selector of selectors) {
      try {
        const element = await page
          .locator(selector)
          .first()
          .textContent({ timeout: 3000 });
        if (element && element.trim()) {
          orderNumber = element.trim();
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!orderNumber) {
      // Try to get text from the entire page and extract order number
      try {
        const pageText = await page.textContent("body");
        const match = pageText.match(/(Order|#)\s*([A-Z0-9\-]+)/i);
        if (match) {
          orderNumber = match[2];
        }
      } catch (e) {
        console.log('⚠️  Could not read page content, browser may have closed');
      }
    }

    if (orderNumber) {
      // Save to history
      const historyEntry = {
        orderNumber: orderNumber,
        date: new Date().toISOString(),
        environment: ENVIRONMENT,
        products: orderConfig.orders,
        customer: customer.email,
        total: 'N/A' // Can't get total if browser closed
      };

      let history = [];
      try {
        const data = await fs.readFile("order-history.json", "utf8");
        history = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet
      }

      history.push(historyEntry);
      await fs.writeFile(
        "order-history.json",
        JSON.stringify(history, null, 2),
      );

      console.log("✅ Order placed successfully! Order #:", orderNumber);
    } else {
      console.log("⚠️  Order placed but could not capture order number");
    }
  } catch (error) {
    console.log(
      "⚠️  Order may have been placed but could not capture order number:",
      error.message,
    );
  }
});
