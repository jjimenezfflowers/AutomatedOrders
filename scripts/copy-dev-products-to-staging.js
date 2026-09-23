const { db, disconnect } = require('../lib/db');
const store = require('../lib/store');

const STAGING_PATHS = {
  'babys-breath-flower-new-love-3': '/products/babys-breath-flower-new-love',
  'burgundy-blush-wedding-diy-flower-kit-2': '/products/burgundy-blush-wedding-diy-flower-kit',
};

async function main() {
  const client = db();
  const [devProducts, stagingProducts, stagingBaseUrl] = await Promise.all([
    store.getProducts('dev', client),
    store.getProducts('staging', client),
    store.getStagingBaseUrl(client),
  ]);
  if (!stagingBaseUrl) throw new Error('Staging base URL is not configured.');

  const stagingOrigin = new URL(stagingBaseUrl).origin;
  const existingNames = new Set(stagingProducts.map(product => product.name.toLowerCase()));
  const existingIds = new Set(stagingProducts.map(product => product.id));
  const missing = devProducts.filter(product => !existingNames.has(product.name.toLowerCase()));

  for (const product of missing) {
    if (existingIds.has(product.id)) {
      throw new Error(`Staging already uses product ID "${product.id}" for another product.`);
    }
    if (new URL(product.url).hostname !== 'bloom-brain-dev.myshopify.com') {
      throw new Error(`Unexpected Dev URL for "${product.name}": ${product.url}`);
    }
  }

  await client.$transaction(async tx => {
    let position = stagingProducts.length;
    for (const product of missing) {
      const url = new URL(product.url);
      const stagingUrl = new URL(
        (STAGING_PATHS[product.id] || url.pathname) + url.search + url.hash,
        stagingOrigin,
      ).href;
      await tx.product.create({
        data: {
          environment: 'staging',
          slug: product.id,
          name: product.name,
          url: stagingUrl,
          variantSelector: product.variantSelector || null,
          defaultVariant: product.defaultVariant || null,
          quantitySelector: 'input[name="quantity"]',
          defaultQuantity: product.defaultQuantity,
          type: product.type || null,
          position: position++,
          origins: {
            create: product.origin.map((value, index) => ({ value, position: index })),
          },
          variants: {
            create: product.variants.map((value, index) => ({ value, position: index })),
          },
          options: {
            create: (product.productOptions || []).map((option, index) => ({
              externalId: option.id,
              label: option.label,
              selector: option.selector,
              defaultValue: option.defaultValue || null,
              position: index,
              choices: {
                create: option.options.map((choice, choiceIndex) =>
                  typeof choice === 'string'
                    ? { value: choice, position: choiceIndex }
                    : {
                      value: choice.value,
                      label: choice.label,
                      price: choice.price ?? null,
                      position: choiceIndex,
                    }),
              },
            })),
          },
        },
      });
    }
  });

  console.log(`Added ${missing.length} Dev products to Staging. Total: ${stagingProducts.length + missing.length}.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
