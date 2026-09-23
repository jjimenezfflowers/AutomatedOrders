const { chromium } = require('@playwright/test');
const { db, disconnect } = require('../lib/db');
const store = require('../lib/store');

async function main() {
  const client = db();
  const devProducts = await store.getProducts('dev', client);
  const stagingProducts = await store.getProducts('staging', client);
  const originalNames = new Set([
    'Impressive Daydream DIY Flower Kit',
    'Light Blue Delphinium Flower',
    'Floreana White Spray Roses',
    'Eskimo White Rose',
  ]);
  const requestedIds = new Set(process.argv.slice(2));
  const copiedProducts = stagingProducts.filter(product =>
    devProducts.some(dev => dev.id === product.id) &&
    !originalNames.has(product.name) &&
    (!requestedIds.size || requestedIds.has(product.id)));
  if (requestedIds.size && copiedProducts.length !== requestedIds.size) {
    throw new Error('One or more requested IDs are not copied Staging products.');
  }
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const updates = [];
  const unavailable = [];

  try {
    for (const product of copiedProducts) {
      try {
        const response = await page.goto(product.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        if (!response || !response.ok()) {
          throw new Error(`storefront returned ${response?.status() ?? 'no response'}`);
        }

        const quantityIds = await page.locator('select[name="quantity"][id], input[name="quantity"][id]')
          .evaluateAll(elements => elements.map(element => element.id));
        const id = quantityIds.find(value => /^quantity-\d+-2$/.test(value));
        if (!id) {
          throw new Error(`no product quantity field found (${quantityIds.join(', ')})`);
        }

        updates.push({ slug: product.id, selector: `#${id}` });
        console.log(`${product.name}: #${id}`);
      } catch (error) {
        unavailable.push(`${product.name}: ${error.message}`);
        console.log(`Unavailable: ${product.name}: ${error.message}`);
      }
    }

    await client.$transaction(async tx => {
      for (const update of updates) {
        await tx.product.update({
          where: { environment_slug: { environment: 'staging', slug: update.slug } },
          data: { quantitySelector: update.selector },
        });
      }
    });
    console.log(`Updated ${updates.length} Staging quantity selectors.`);
    if (unavailable.length) console.log(`${unavailable.length} products need a valid Staging page.`);
  } finally {
    await browser.close();
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
