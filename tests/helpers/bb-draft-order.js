const { expect } = require('@playwright/test');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleEscapedText(value) {
  return escapeRegExp(String(value).trim()).replace(/\s+/g, '\\s+');
}

function variantSearchText(value) {
  return String(value || '')
    .replace(/\s*(?:-\s*)?\$[\d,.]+\s*$/, '')
    .replace(/\s*\(\d+\s+Bunches?\)/ig, '')
    .trim();
}

function optionLabelPattern(value) {
  const label = String(value || '')
    .replace(/\s*(?:-\s*)?\$[\d,.]+\s*$/, '')
    .trim();
  const bunchPattern = /\s*\((\d+\s+Bunches?)\)\s*/ig;
  let pattern = '';
  let cursor = 0;
  let match;

  while ((match = bunchPattern.exec(label))) {
    pattern += flexibleEscapedText(label.slice(cursor, match.index));
    pattern += `(?:\\s*\\(${flexibleEscapedText(match[1])}\\))?`;
    cursor = bunchPattern.lastIndex;
  }

  pattern += flexibleEscapedText(label.slice(cursor));
  return pattern;
}

function optionNamePattern(value) {
  return new RegExp(
    `^${optionLabelPattern(value)}(?:\\s*(?:-\\s*)?\\$[\\d,.]+)?$`,
    'i',
  );
}

function customerSearchTerms(customer) {
  const email = String(customer.email || '').trim();
  const firstName = String(customer.firstName || '').trim();
  const fullName = `${firstName} ${String(customer.lastName || '').trim()}`.trim();
  return [...new Set([email, firstName, fullName].filter(Boolean))];
}

function customerOptionPattern(customer) {
  const email = String(customer.email || '').trim();
  if (email) return new RegExp(escapeRegExp(email), 'i');

  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
  return new RegExp(`^${flexibleEscapedText(fullName)}(?:\\s*\\([^)]*\\))?$`, 'i');
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error(`Invalid BB delivery date "${value}". Use YYYY-MM-DD.`);

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid BB delivery date "${value}".`);
  }

  return date;
}

function deliveryDateName(value) {
  const date = parseIsoDate(value);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
  const month = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11
    ? 'st'
    : day % 10 === 2 && day !== 12
      ? 'nd'
      : day % 10 === 3 && day !== 13
        ? 'rd'
        : 'th';

  return new RegExp(`^${weekday}, ${month} ${day}${suffix}, ${date.getUTCFullYear()}`);
}

async function waitForDeliveryDateAvailability(
  targetButton,
  timeout = 15_000,
  pollInterval = 100,
) {
  const deadline = Date.now() + timeout;

  while (true) {
    if (await targetButton.isEnabled()) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise(resolve => setTimeout(resolve, Math.min(pollInterval, remaining)));
  }
}

async function chooseSearchOption(page, trigger, search, optionText) {
  await trigger.click();
  const input = page.getByRole('combobox', { expanded: true }).last();
  await input.fill(search);

  const optionName = optionText instanceof RegExp
    ? optionText
    : optionNamePattern(optionText);
  const option = page.getByRole('option', { name: optionName });
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click({ timeout: 10_000 });
}

async function chooseCustomerOption(page, trigger, customer) {
  const searchTerms = customerSearchTerms(customer);
  if (!searchTerms.length) {
    throw new Error('BB Draft Orders require a configured customer email or name.');
  }

  await trigger.click();
  const input = page.getByRole('combobox', { expanded: true }).last();
  const option = page.getByRole('option', { name: customerOptionPattern(customer) });

  for (const search of searchTerms) {
    await input.fill(search);
    try {
      await option.waitFor({ state: 'visible', timeout: 5_000 });
    } catch {
      continue;
    }
    await option.click({ timeout: 10_000 });
    return;
  }

  throw new Error('BB could not find the configured customer by email or name.');
}

async function selectDeliveryDate(page, trigger, value) {
  const target = parseIsoDate(value);
  await trigger.click();

  for (let attempts = 0; attempts < 24; attempts += 1) {
    const targetButton = page.getByRole('button', { name: deliveryDateName(value) }).first();
    if (await targetButton.count()) {
      // BB renders the new month before its availability request finishes. During
      // that short window every day is disabled, including otherwise valid dates.
      if (!(await waitForDeliveryDateAvailability(targetButton))) {
        throw new Error(`BB does not offer ${value} for this product.`);
      }
      await targetButton.click();
      await page.keyboard.press('Escape');
      return;
    }

    const heading = page.getByText(new RegExp(`^(${MONTHS.join('|')}) \\d{4}$`)).last();
    const headingText = await heading.textContent();
    const [monthName, yearText] = String(headingText).trim().split(' ');
    const visibleMonth = new Date(Date.UTC(Number(yearText), MONTHS.indexOf(monthName), 1));
    const direction = target < visibleMonth ? 'Previous' : 'Next';
    await page.getByRole('button', { name: `Go to the ${direction} Month` }).click();
  }

  throw new Error(`Could not reach BB delivery date ${value}.`);
}

async function addConfiguredProduct(page, product, order, fallbackDeliveryDate) {
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Product' });
  await expect(dialog).toBeVisible();

  await chooseSearchOption(page, dialog.getByRole('combobox').first(), product.name, product.name);
  console.log(`BB: product selected (${product.name})`);

  if (order.variant) {
    const variantTrigger = dialog.getByRole('combobox').nth(1);
    await chooseSearchOption(page, variantTrigger, variantSearchText(order.variant), order.variant);
    console.log(`BB: variant selected (${order.variant})`);
  }

  if (product.productOptions?.length) {
    for (const [index, option] of product.productOptions.entries()) {
      const value = order.productOptions?.[option.id] ?? option.defaultValue;
      if (!value) continue;
      await chooseSearchOption(page, dialog.getByRole('combobox').nth(index + 2), value, value);
    }
  }

  await dialog.getByRole('button', { name: 'Add Product', exact: true }).click();
  await expect(dialog).toBeHidden();
  console.log(`BB: product added (${product.name})`);

  const productRow = page
    .getByText(product.name, { exact: true })
    .locator("xpath=ancestor::*[.//input[@type='number'] and .//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delivery date')]][1]");
  await expect(productRow).toBeVisible();

  const quantityNumber = Math.max(1, Number(order.quantity) || 1);
  const quantityValue = String(quantityNumber);
  const quantity = productRow.locator(
    'input[type="text"][aria-roledescription="Number field"]',
  );
  const currentQuantity = Number(await quantity.inputValue()) || 1;
  const quantityButton = productRow.getByRole('button', {
    name: quantityNumber > currentQuantity ? 'Increase Quantity' : 'Decrease Quantity',
  });
  for (let step = 0; step < Math.abs(quantityNumber - currentQuantity); step += 1) {
    await quantityButton.click();
  }
  await expect(quantity).toHaveValue(quantityValue);
  console.log(`BB: quantity set (${quantityValue})`);

  const deliveryDate = order.deliveryDate || fallbackDeliveryDate;
  if (deliveryDate) {
    await selectDeliveryDate(
      page,
      productRow.getByRole('button', { name: 'Select delivery date' }),
      deliveryDate,
    );
    console.log(`BB: delivery date set (${deliveryDate})`);
  }
}

async function selectExistingCustomer(page, customer) {
  const email = String(customer.email || '').trim();
  const customerDetails = page.getByRole('group', { name: 'Draft order details' });
  const selectedEmail = email
    ? customerDetails.getByText(new RegExp(`^${escapeRegExp(email)}$`, 'i')).first()
    : null;

  if (selectedEmail && await selectedEmail.isVisible().catch(() => false)) {
    console.log('BB: configured customer was already selected');
    return;
  }

  await page.getByRole('button', { name: /^(?:Find customer|Change)$/ }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Select existing customer' });
  await expect(dialog).toBeVisible();

  await chooseCustomerOption(
    page,
    dialog.getByRole('combobox', { name: 'Customer' }),
    customer,
  );
  await dialog.getByRole('button', { name: 'Select customer' }).click();
  await expect(dialog).toBeHidden();
  if (selectedEmail) {
    await expect(selectedEmail).toBeVisible();
  } else {
    await expect(customerDetails.getByRole('button', { name: 'Change' }).last()).toBeVisible();
  }
}

async function applyAddressSuggestions(dialog, timeout = 5_000) {
  const applyAll = dialog.getByRole('button', { name: /^Apply all$/i });
  const validationResult = await Promise.any([
    applyAll.waitFor({ state: 'visible', timeout }).then(() => 'suggestions'),
    dialog.waitFor({ state: 'hidden', timeout }).then(() => 'saved'),
  ]).catch(() => 'timeout');
  if (validationResult !== 'suggestions') return false;

  await applyAll.click();
  await dialog.getByRole('button', { name: /^Re-check & Save$/i }).click({ timeout: 10_000 });
  console.log('BB: address validation suggestions applied');
  return true;
}

async function setAddress(page, customer, kind) {
  const label = kind === 'billing' ? 'Edit billing address' : 'Edit shipping address';
  await page.getByRole('button', { name: label }).last().click();

  const heading = kind === 'billing' ? 'Edit billing address' : 'Edit shipping address';
  const dialog = page.getByRole('dialog', { name: heading });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('textbox', { name: /^First name/i }).fill(customer.firstName);
  await dialog.getByRole('textbox', { name: /^Last name/i }).fill(customer.lastName);
  await dialog.getByRole('textbox', { name: /Address(?: line)? 1/i }).fill(customer.address);
  await dialog.getByRole('textbox', { name: /Address(?: line)? 2/i }).fill(customer.address2 || '');
  await dialog.getByRole('textbox', { name: /^City/i }).fill(customer.city);
  await dialog.getByRole('textbox', { name: /Zip|Postal/i }).fill(customer.zipCode);
  const phone = dialog.locator('input[type="tel"]');
  const configuredPhone = String(customer.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const currentPhone = String(await phone.inputValue()).replace(/\D/g, '').slice(-10);
  if (configuredPhone && currentPhone !== configuredPhone) {
    await phone.click();
    await phone.press('ControlOrMeta+A');
    await phone.press('Backspace');
    await phone.pressSequentially(configuredPhone);
    await phone.press('Tab');
    await expect.poll(async () => (
      String(await phone.inputValue()).replace(/\D/g, '').slice(-10)
    )).toBe(configuredPhone);
  }

  const stateName = US_STATES[String(customer.state || '').toUpperCase()] || customer.state;
  await chooseSearchOption(
    page,
    dialog.getByRole('combobox', { name: /State|Province/i }),
    stateName,
    stateName,
  );

  const country = dialog.getByRole('combobox', { name: /Country/i });
  if (!/United States/i.test((await country.textContent()) || '')) {
    await country.click();
    await page.getByRole('option', { name: 'United States', exact: true }).click();
  }

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await applyAddressSuggestions(dialog);
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function applyConfiguredAddresses(page, customer) {
  await setAddress(page, customer, 'billing');
  await setAddress(page, customer, 'shipping');
}

module.exports = {
  addConfiguredProduct,
  applyAddressSuggestions,
  applyConfiguredAddresses,
  customerOptionPattern,
  customerSearchTerms,
  deliveryDateName,
  optionNamePattern,
  selectDeliveryDate,
  selectExistingCustomer,
  variantSearchText,
  waitForDeliveryDateAvailability,
};
