#!/usr/bin/env node
// Lists the delivery days a product's calendar offers for a given month, so an
// order can be configured with a date the storefront will actually accept.
//
//   node tests/find-available-dates.js <productUrl> [Month] [Year]
//   node tests/find-available-dates.js https://shop.example/products/roses September 2026

const { chromium } = require('@playwright/test');
const { findAvailableDeliveryDays, MONTH_NAMES } = require('./helpers/product-form');

const USAGE = 'Uso: node tests/find-available-dates.js <productUrl> [Month] [Year]';

function parseArgs(argv) {
  const [productUrl, month = MONTH_NAMES[new Date().getMonth()], year = String(new Date().getFullYear())] = argv;

  if (!productUrl) {
    throw new Error(`Falta el productUrl.\n${USAGE}`);
  }

  try {
    new URL(productUrl);
  } catch {
    throw new Error(`productUrl invalido: "${productUrl}".\n${USAGE}`);
  }

  if (!MONTH_NAMES.some((name) => name.toLowerCase() === String(month).toLowerCase())) {
    throw new Error(`Mes invalido: "${month}". Usa uno de: ${MONTH_NAMES.join(', ')}`);
  }

  if (!/^\d{4}$/.test(String(year))) {
    throw new Error(`Año invalido: "${year}". Usa YYYY.`);
  }

  return { productUrl, month, year };
}

async function main() {
  const { productUrl, month, year } = parseArgs(process.argv.slice(2));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });

    const days = await findAvailableDeliveryDays(page, { month, year, timeout: 15000 });

    console.log(`${month} ${year} disponibles: ${days.join(', ') || '(ninguno)'}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
});
