const { chromium } = require('@playwright/test');
const { db, disconnect } = require('../lib/db');

const SLUG = 'choose-your-own-florist-greens-1';
const URL = 'https://bloom-brain-dev.myshopify.com/products/choose-your-own-florist-greens-1';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let catalog;

  try {
    const page = await browser.newPage();
    const response = await page.goto(URL, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error(`Product page returned ${response?.status()}.`);
    await page.locator('select[name^="vo_"]').first().waitFor({ state: 'attached' });

    catalog = await page.evaluate(() => ({
      variants: [...document.querySelectorAll('#option-0 option')].map(option =>
        option.textContent.replace(/\s+/g, ' ').trim()),
      options: [...document.querySelectorAll('select[name^="vo_"]')].map((select, index) => ({
        id: select.name,
        label: `Choose Your Own Florist Greens ${index + 1}`,
        selector: `select[name^="vo_${index}_"]`,
        defaultValue: select.value,
        values: [...select.options].map(option => option.value),
      })),
    }));
  } finally {
    await browser.close();
  }

  if (catalog.variants.length !== 4 || catalog.options.length !== 5) {
    throw new Error('Unexpected variant or product option count.');
  }
  for (const [index, option] of catalog.options.entries()) {
    if (!option.id.startsWith(`vo_${index}_`) || option.values.length !== 13 ||
        !option.values.includes(option.defaultValue)) {
      throw new Error(`Unexpected values for ${option.label}.`);
    }
  }

  const client = db();
  const product = await client.product.findUnique({
    where: { environment_slug: { environment: 'dev', slug: SLUG } },
  });
  if (!product) throw new Error(`Dev product ${SLUG} was not found.`);

  await client.$transaction(async tx => {
    await tx.productOption.deleteMany({ where: { productId: product.id } });
    await tx.productVariant.deleteMany({ where: { productId: product.id } });
    await tx.product.update({
      where: { id: product.id },
      data: {
        variantSelector: '#option-0',
        defaultVariant: catalog.variants[0],
        variants: {
          create: catalog.variants.map((value, position) => ({ value, position })),
        },
        options: {
          create: catalog.options.map((option, position) => ({
            externalId: option.id,
            label: option.label,
            selector: option.selector,
            defaultValue: option.defaultValue,
            position,
            choices: {
              create: option.values.map((value, choicePosition) => ({
                value,
                position: choicePosition,
              })),
            },
          })),
        },
      },
    });
  });

  console.log(`Configured ${catalog.variants.length} variants and ${catalog.options.length} product options in Dev.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
