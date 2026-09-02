function normalizeText(value) {
  return String(value || '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactText(value) {
  return normalizeText(value)
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function scoreMatch(target, candidate) {
  const targetNorm = normalizeText(target);
  const candidateNorm = normalizeText(candidate);
  const targetCompact = compactText(target);
  const candidateCompact = compactText(candidate);

  if (!targetCompact || !candidateCompact) return 0;
  if (candidateNorm === targetNorm || candidateCompact === targetCompact) return 100;
  if (candidateCompact.includes(targetCompact)) return 90;
  if (targetCompact.includes(candidateCompact) && candidateCompact.length >= 6) {
    return 70 + Math.min(19, Math.floor((candidateCompact.length / targetCompact.length) * 20));
  }
  return 0;
}

function bestTextMatch(target, candidates) {
  return candidates.reduce(
    (best, candidate, index) => {
      const parts = candidate.parts.filter(Boolean);
      const joined = parts.join(' ');
      const score = Math.max(
        scoreMatch(target, joined),
        ...parts.map((part) => scoreMatch(target, part)),
      );

      if (score > best.score) {
        return { ...candidate, index, score, text: joined };
      }

      return best;
    },
    { index: -1, score: 0, text: '' },
  );
}

async function getTagName(locator) {
  return locator.evaluate((el) => el.tagName.toLowerCase());
}

async function getVisibleOrAttachedLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (count > 0) {
      return { selector, locator };
    }
  }

  return null;
}

async function selectVariantSelect(page, locator, targetVariant, selector) {
  await locator.first().waitFor({ state: 'attached', timeout: 5000 });

  const candidates = await locator.first().locator('option').evaluateAll((options) =>
    options.map((option) => ({
      value: option.value,
      label: option.label,
      text: option.textContent || '',
      parts: [option.value, option.label, option.textContent || ''],
    })),
  );

  const direct = candidates.find((candidate) => candidate.value === targetVariant);
  if (direct) {
    await locator.first().selectOption(direct.value);
    return direct.text || direct.label || direct.value;
  }

  const match = bestTextMatch(targetVariant, candidates);
  if (match.score < 60) {
    throw new Error(`No se encontro la variante "${targetVariant}" en el selector ${selector}`);
  }

  await locator.first().selectOption(match.value);
  return match.text || match.label || match.value;
}

async function radioCandidates(locator) {
  return locator.evaluateAll((inputs) =>
    inputs.map((input) => {
      const label = input.id
        ? Array.from(document.querySelectorAll('label')).find((item) => item.htmlFor === input.id)
        : null;
      const stemCount = input.getAttribute('data-stem-count');
      const unit = input.getAttribute('data-unit-of-measure');
      const stemsText = stemCount ? `${stemCount} ${unit === 'stem' ? 'Stem' : 'Stems'}` : '';

      return {
        id: input.id || '',
        value: input.value || '',
        checked: input.checked,
        parts: [
          input.value || '',
          input.getAttribute('data-variant-title') || '',
          stemsText,
          input.getAttribute('data-price') || '',
          input.getAttribute('aria-label') || '',
          label?.innerText || label?.textContent || '',
        ],
      };
    }),
  );
}

async function selectVariantRadio(page, locator, targetVariant, selector) {
  await locator.first().waitFor({ state: 'attached', timeout: 5000 });

  const candidates = await radioCandidates(locator);
  const match = bestTextMatch(targetVariant, candidates);
  if (match.score < 60) {
    throw new Error(`No se encontro la variante "${targetVariant}" en el selector ${selector}`);
  }

  const radio = locator.nth(match.index);
  const radioId = match.id || (await radio.getAttribute('id'));
  if (radioId) {
    const label = page.locator(`label[for="${radioId.replace(/"/g, '\\"')}"]`).first();
    if ((await label.count()) > 0 && (await label.isVisible().catch(() => false))) {
      await label.click();
    } else {
      await radio.check({ force: true });
    }
  } else {
    await radio.check({ force: true });
  }

  if (!(await radio.isChecked().catch(() => false))) {
    await radio.check({ force: true });
  }

  return match.text;
}

async function selectVariantGeneric(locator, targetVariant, selector) {
  await locator.first().waitFor({ state: 'attached', timeout: 5000 });
  const candidates = await locator.evaluateAll((elements) =>
    elements.map((element) => ({
      parts: [
        element.getAttribute('value') || '',
        element.getAttribute('data-variant-title') || '',
        element.getAttribute('data-price') || '',
        element.getAttribute('aria-label') || '',
        element.innerText || element.textContent || '',
      ],
    })),
  );

  const match = bestTextMatch(targetVariant, candidates);
  if (match.score < 60) {
    throw new Error(`No se encontro la variante "${targetVariant}" en el selector ${selector}`);
  }

  await locator.nth(match.index).click();
  return match.text;
}

function isConfiguredDefaultVariant(product, targetVariant) {
  return Boolean(product.defaultVariant) && scoreMatch(targetVariant, product.defaultVariant) >= 60;
}

async function getSelectedShopifyVariantId(page) {
  return page
    .evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form[action*="/cart/add"]'));
      const scopes = forms.length > 0 ? forms : [document];

      for (const scope of scopes) {
        const controls = Array.from(
          scope.querySelectorAll('input[name="id"], select[name="id"], textarea[name="id"]'),
        );
        const selectedControl =
          controls.find((control) => {
            const type = (control.getAttribute('type') || '').toLowerCase();
            return ['radio', 'checkbox'].includes(type) && control.checked && control.value;
          }) ||
          controls.find((control) => {
            const type = (control.getAttribute('type') || '').toLowerCase();
            return !['radio', 'checkbox'].includes(type) && control.value;
          });

        if (selectedControl?.value) {
          return selectedControl.value.trim();
        }
      }

      return '';
    })
    .catch(() => '');
}

async function waitForSelectedShopifyVariantId(page, timeout = 3000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const variantId = await getSelectedShopifyVariantId(page);
    if (/^\d+$/.test(variantId)) return variantId;
    await page.waitForTimeout(250);
  }

  return '';
}

async function syncSelectedVariantUrl(page, product, targetVariant) {
  if (isConfiguredDefaultVariant(product, targetVariant)) return false;

  let currentUrl;
  try {
    currentUrl = new URL(page.url());
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(currentUrl.protocol)) return false;

  const variantId = await waitForSelectedShopifyVariantId(page);
  if (!variantId || currentUrl.searchParams.get('variant') === variantId) return false;

  currentUrl.searchParams.set('variant', variantId);
  await page.goto(currentUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  return true;
}

async function selectVariantFromOrder(page, product, order) {
  if (!order.variant) return null;

  const selectors = unique([
    product.variantSelector,
    'variant-radios input[type="radio"]',
    'ff-variant-tiles input[type="radio"]',
    'input[type="radio"][name="Variants"]',
    'input[type="radio"][name^="options"]',
    'select[name^="options"]',
    'select.productVariantSelect',
    '#option-0',
  ]);

  const found = await getVisibleOrAttachedLocator(page, selectors);
  if (!found) {
    throw new Error(`No se encontro un selector de variantes para "${order.variant}"`);
  }

  const first = found.locator.first();
  const tagName = await getTagName(first);
  const inputType = tagName === 'input' ? await first.getAttribute('type') : '';
  let selectedVariant;

  if (tagName === 'select') {
    selectedVariant = await selectVariantSelect(page, found.locator, order.variant, found.selector);
  } else if (tagName === 'input' && ['radio', 'checkbox'].includes((inputType || '').toLowerCase())) {
    selectedVariant = await selectVariantRadio(page, found.locator, order.variant, found.selector);
  } else {
    selectedVariant = await selectVariantGeneric(found.locator, order.variant, found.selector);
  }

  await syncSelectedVariantUrl(page, product, order.variant);
  return selectedVariant;
}

function cssAttributeValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function productOptionCandidates(option) {
  return (option.options || []).map((item) => {
    if (typeof item === 'string') {
      return {
        value: item,
        label: item,
        parts: [item],
      };
    }

    return {
      value: item.value,
      label: item.label,
      parts: [item.value, item.label, item.price != null ? String(item.price) : ''],
    };
  });
}

function resolveProductOptionValue(option, targetValue) {
  const configuredValue = String(targetValue || '').trim();
  if (!configuredValue) return '';

  const candidates = productOptionCandidates(option);
  const direct = candidates.find((candidate) => candidate.value === configuredValue);
  if (direct) return direct.value;

  const match = bestTextMatch(configuredValue, candidates);
  if (match.score >= 60) return match.value;

  return configuredValue;
}

async function selectOpenComboboxOption(page, targetValue, selector) {
  const options = page.locator('[role="option"]:visible');
  await options.first().waitFor({ state: 'visible', timeout: 5000 });

  const candidates = await options.evaluateAll((elements) =>
    elements.map((element) => ({
      parts: [
        element.getAttribute('value') || '',
        element.getAttribute('data-value') || '',
        element.getAttribute('aria-label') || '',
        element.innerText || element.textContent || '',
      ],
    })),
  );

  const match = bestTextMatch(targetValue, candidates);
  if (match.score < 60) {
    throw new Error(`No se encontro la opcion "${targetValue}" en el selector ${selector}`);
  }

  await options.nth(match.index).click();
  return match.text;
}

async function getProductOptionLocator(page, option) {
  const selectors = unique([
    option.selector,
    option.id ? `select[name="${cssAttributeValue(option.id)}"]` : null,
    option.id ? `[name="${cssAttributeValue(option.id)}"]` : null,
  ]);

  const found = await getVisibleOrAttachedLocator(page, selectors);
  if (found) return found;

  if (!option.label) return null;

  const label = page.locator('label').filter({ hasText: new RegExp(`^\\s*${option.label}\\s*$`, 'i') }).first();
  if ((await label.count().catch(() => 0)) === 0) return null;

  const labelledControl = label.locator('xpath=following-sibling::*[@role="combobox" or self::select or self::input][1]');
  if ((await labelledControl.count().catch(() => 0)) > 0) {
    return { selector: `label "${option.label}"`, locator: labelledControl };
  }

  const htmlFor = await label.getAttribute('for').catch(() => '');
  if (!htmlFor) return null;

  const byId = page.locator(`[id="${cssAttributeValue(htmlFor)}"]`);
  if ((await byId.count().catch(() => 0)) > 0) {
    return { selector: `label[for="${htmlFor}"]`, locator: byId };
  }

  return null;
}

async function selectProductOption(page, option, targetValue) {
  const valueToSelect = resolveProductOptionValue(option, targetValue);
  if (!valueToSelect) {
    throw new Error(`No hay valor configurado para la opcion "${option.label || option.id}"`);
  }

  const found = await getProductOptionLocator(page, option);
  if (!found) {
    throw new Error(`No se encontro el selector de opcion "${option.label || option.id}"`);
  }

  const optionLocator = found.locator.first();
  await optionLocator.waitFor({ state: 'attached', timeout: 10000 });
  const tagName = await getTagName(optionLocator);

  if (tagName === 'select') {
    return selectVariantSelect(page, found.locator, valueToSelect, found.selector);
  }

  await optionLocator.waitFor({ state: 'visible', timeout: 10000 });
  await optionLocator.click();
  const selected = await selectOpenComboboxOption(page, valueToSelect, found.selector);
  await page.waitForTimeout(300);
  return selected;
}

async function selectProductOptionsFromOrder(page, product, order, options = {}) {
  if (product.type !== 'product-options' || !product.productOptions?.length) return [];

  const log = options.log || (() => {});
  log(`  Configuring ${product.productOptions.length} product options...`);

  const selections = [];
  for (const option of product.productOptions) {
    const configuredValue = order.productOptions?.[option.id] || option.defaultValue;
    const valueToSelect = resolveProductOptionValue(option, configuredValue);

    log(`    - ${option.label}: selecting "${valueToSelect}" (from config: "${configuredValue}")`);
    log(`      Selector: ${option.selector || option.id}`);

    const selectedValue = await selectProductOption(page, option, configuredValue);
    log(`      ✓ Selected: "${selectedValue}"`);
    selections.push({ id: option.id, label: option.label, value: selectedValue });
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(500);
  return selections;
}

function parseDeliveryDate(deliveryDate) {
  const value = String(deliveryDate || '').trim();
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Fecha invalida: "${deliveryDate}". Usa YYYY-MM-DD.`);
    }

    return {
      year: isoMatch[1],
      month,
      day,
      iso: `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`,
    };
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    // The storefront is US-locale, so slash dates are MM/DD/YYYY. Only fall back to
    // day-first when the first component cannot be a month (e.g. 25/12/2026).
    const isDayFirst = first > 12;
    const month = isDayFirst ? second : first;
    const day = isDayFirst ? first : second;

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Fecha invalida: "${deliveryDate}". Usa YYYY-MM-DD.`);
    }

    return {
      year: slashMatch[3],
      month,
      day,
      iso: `${slashMatch[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }

  throw new Error(`Formato de fecha no soportado: "${deliveryDate}". Usa YYYY-MM-DD.`);
}

async function getCalendarRoot(page) {
  const selectors = [
    '[data-ff-product-calendar][calendar-location="product-template"]',
    '.calendar-container',
  ];

  for (const selector of selectors) {
    const roots = page.locator(selector);
    const count = await roots.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const root = roots.nth(index);
      const hasDayButtons = (await root.locator('button[name="day"]').count().catch(() => 0)) > 0;
      if (hasDayButtons) return root;
    }
  }

  return page.locator('body');
}

async function getCalendarDayState(dayButton) {
  const isVisible = await dayButton.isVisible().catch(() => false);
  const state = await dayButton
    .evaluate((button) => {
      const text = button.textContent || '';
      const className = typeof button.className === 'string'
        ? button.className
        : button.className?.baseVal || '';
      const classes = className.split(/\s+/).filter(Boolean);
      const dayMatch = text.trim().match(/^(\d{1,2})\b/);
      const hasUnavailableClass = classes.some((classItem) =>
        ['cursor-not-allowed', '!cursor-not-allowed', 'pointer-events-none', '!pointer-events-none'].includes(classItem),
      );

      return {
        day: dayMatch ? Number(dayMatch[1]) : null,
        text: text.trim().replace(/\s+/g, ' '),
        disabled:
          button.disabled ||
          button.hasAttribute('disabled') ||
          button.getAttribute('aria-disabled') === 'true' ||
          /unavailable/i.test(text) ||
          hasUnavailableClass,
      };
    })
    .catch(() => ({ day: null, text: '', disabled: true }));

  return { ...state, visible: isVisible };
}

async function selectCalendarOption(page, root, buttonLocator, expectedText, optionLabel, log) {
  const currentText = ((await buttonLocator.textContent().catch(() => '')) || '').trim();
  if (new RegExp(`^\\s*${expectedText}\\s*$`, 'i').test(currentText)) return;

  log(`    Haciendo click en botón de ${optionLabel}...`);
  await buttonLocator.click();
  await page.waitForTimeout(1000);

  const option = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${expectedText}$`, 'i') }).first();
  if ((await option.count()) === 0) {
    throw new Error(`❌ No se encontró la opción de ${optionLabel} "${expectedText}" en el calendario`);
  }

  await option.click();
  await page.waitForTimeout(1500);
  await root.locator('button[name="day"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}

async function clickAvailableCalendarDay(root, dayNumber) {
  const dayButtons = root.locator('button[name="day"]');
  const count = await dayButtons.count().catch(() => 0);
  const matches = [];

  for (let index = 0; index < count; index++) {
    const dayButton = dayButtons.nth(index);
    const state = await getCalendarDayState(dayButton);
    if (state.day === dayNumber && state.visible) {
      matches.push({ dayButton, state });
    }
  }

  const available = matches.find((match) => !match.state.disabled);
  if (available) {
    await available.dayButton.click();
    return available.state;
  }

  if (matches.length > 0) {
    const details = matches.map((match) => match.state.text || String(dayNumber)).join(' | ');
    throw new Error(`FECHA NO DISPONIBLE: El día ${dayNumber} está marcado como no disponible (${details}). Elige otra fecha de entrega.`);
  }

  const availableDays = [];
  for (let index = 0; index < count; index++) {
    const state = await getCalendarDayState(dayButtons.nth(index));
    if (state.visible && state.day && !state.disabled) {
      availableDays.push(state.day);
    }
  }

  const suffix = availableDays.length > 0
    ? `. Días disponibles visibles: ${unique(availableDays.map(String)).join(', ')}`
    : '';
  throw new Error(`❌ No se encontró el día ${dayNumber} en el calendario${suffix}`);
}

async function selectDeliveryDate(page, deliveryDate, options = {}) {
  const log = options.log || (() => {});
  const environment = options.environment || 'dev';
  const parsed = parseDeliveryDate(deliveryDate);
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthName = monthNames[parsed.month - 1];
  if (!monthName || !parsed.day || Number.isNaN(parsed.day)) {
    throw new Error(`Formato de fecha no soportado: "${deliveryDate}". Usa YYYY-MM-DD.`);
  }

  await page.waitForTimeout(2000);

  const dateInput = page.locator('input[type="date"]').first();
  const dateInputExists = (await dateInput.count().catch(() => 0)) > 0;
  log(`  Buscando input[type="date"]: ${dateInputExists ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);

  if (dateInputExists) {
    log(`  → Usando método directo (input date)`);
    await dateInput.fill(parsed.iso);
    await page.waitForTimeout(500);
    await dateInput.dispatchEvent('change');
    await page.waitForTimeout(500);
    log(`  ✅ Fecha establecida: ${parsed.iso}`);
    return parsed.iso;
  }

  log(`  → Usando método de calendario`);
  log(`  Navegando a: ${monthName} ${parsed.day}, ${parsed.year}`);
  await page.waitForTimeout(environment === 'staging' ? 6000 : 1500);

  const root = await getCalendarRoot(page);
  const monthButton = root
    .locator('button[role="combobox"]')
    .filter({ hasText: /january|february|march|april|may|june|july|august|september|october|november|december/i })
    .first();
  const monthButtonCount = await monthButton.count().catch(() => 0);
  log(`  Buscando botón del mes: ${monthButtonCount > 0 ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
  if (monthButtonCount === 0) {
    throw new Error(`❌ No se encontró el botón del mes en el calendario`);
  }

  const monthButtonText = ((await monthButton.textContent().catch(() => '')) || '').trim();
  log(`    Texto actual del botón: "${monthButtonText}"`);
  await selectCalendarOption(page, root, monthButton, monthName, 'mes', log);
  log(`    ✅ Mes "${monthName}" seleccionado`);

  const yearButton = root
    .locator('button[role="combobox"]')
    .filter({ hasText: /^\s*\d{4}\s*$/ })
    .first();
  if ((await yearButton.count().catch(() => 0)) > 0) {
    await selectCalendarOption(page, root, yearButton, parsed.year, 'año', log);
  }

  log(`  Buscando día ${parsed.day}...`);
  const selectedDay = await clickAvailableCalendarDay(root, parsed.day);
  log(`    Día ${parsed.day}: ENCONTRADO`);
  log(`    Estado del botón: ENABLED`);
  log(`    Haciendo click en día ${parsed.day}...`);
  await page.waitForTimeout(500);
  log(`    ✅ Día ${parsed.day} seleccionado`);

  return selectedDay.text || String(parsed.day);
}

async function setQuantityFromOrder(page, product, order) {
  const quantity = Number(order.quantity || product.defaultQuantity || 1);
  const quantityText = String(quantity);
  const selectors = unique([
    product.quantitySelector,
    'select[name="quantity"]',
    'input[name="quantity"]',
    'quantity-input input[type="number"]',
    '.quantity__input',
  ]);

  const found = await getVisibleOrAttachedLocator(page, selectors);
  if (!found) {
    throw new Error(`No se encontro un selector de cantidad para "${product.name}"`);
  }

  const quantityLocator = found.locator.first();
  await quantityLocator.waitFor({ state: 'attached', timeout: 5000 });
  const tagName = await getTagName(quantityLocator);

  if (tagName === 'select') {
    await quantityLocator.selectOption(quantityText);
  } else if (tagName === 'input' || tagName === 'textarea') {
    await quantityLocator.fill(quantityText);
    await quantityLocator.dispatchEvent('input');
    await quantityLocator.dispatchEvent('change');
    await quantityLocator.blur();
  } else {
    throw new Error(`El selector de cantidad ${found.selector} no es select ni input`);
  }

  return quantityText;
}

// The storefront keeps Add to Cart blocked for a moment after a delivery date is
// picked, and marks that specific block with aria-describedby="product-add-to-cart-hint".
// Clearing THAT block is a legitimate workaround for the lag. Clearing any other
// block is not: a button disabled because the item is sold out, the date is
// unavailable, or a required option is unset must stay disabled, otherwise we place
// a real order for a combination the store deliberately refused.
const ADD_TO_CART_DELIVERY_HINT = 'product-add-to-cart-hint';

async function syncAddToCartAvailabilityFromDeliveryDate(page) {
  return page
    .evaluate(
      ({ hintId }) => {
        const button = document.querySelector(
          '#product-add-to-cart, button[name="add"], button[type="submit"]',
        );
        const deliveryInput = document.querySelector(
          '[data-ff-product-calendar][calendar-location="product-template"] input[name="delivery_date_input"], input[name="delivery_date_input"]',
        );

        if (!button || !deliveryInput) return false;

        // The store writes the accepted date here; an empty value means it has
        // not taken one yet.
        if (!String(deliveryInput.value || '').trim()) return false;

        if (!/add\s*to\s*cart/i.test(button.textContent || '')) return false;

        // The delivery-date hint is the only block we are allowed to clear.
        if (button.getAttribute('aria-describedby') !== hintId) return false;

        const isGiftCard = document.getElementById('isGiftCard')?.value === 'true';
        const isSubscription = Number(document.getElementById('is_subscription')?.value || 0) > 0;
        if (isGiftCard || isSubscription) return false;

        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
        button.removeAttribute('aria-describedby');

        return true;
      },
      { hintId: ADD_TO_CART_DELIVERY_HINT },
    )
    .catch(() => false);
}

async function findAddToCartButton(page, timeout = 30000) {
  const selectors = [
    '#product-add-to-cart',
    'button[name="add"]',
    'button:has-text("Add to cart")',
    'button:has-text("Add To Cart")',
    'button[type="submit"]:has-text("Add")',
  ];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await syncAddToCartAvailabilityFromDeliveryDate(page);

    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      for (let index = 0; index < count; index++) {
        const candidate = locator.nth(index);
        const isVisible = await candidate.isVisible().catch(() => false);
        if (!isVisible) continue;

        const isDisabled = await candidate
          .evaluate((element) => {
            const disabled = element.disabled === true;
            const ariaDisabled = element.getAttribute('aria-disabled') === 'true';
            return disabled || ariaDisabled || element.classList.contains('disabled');
          })
          .catch(() => true);

        if (!isDisabled) {
          return { locator: candidate, selector };
        }
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`No se encontro un boton Add to Cart visible y habilitado en ${timeout}ms`);
}

async function clickAddToCart(page, options = {}) {
  const timeout = options.timeout || 30000;
  const found = await findAddToCartButton(page, timeout);
  await found.locator.click({ timeout: 5000 });
  return found.selector;
}

module.exports = {
  clickAddToCart,
  compactText,
  findAddToCartButton,
  normalizeText,
  parseDeliveryDate,
  selectDeliveryDate,
  selectProductOptionsFromOrder,
  selectVariantFromOrder,
  setQuantityFromOrder,
};
