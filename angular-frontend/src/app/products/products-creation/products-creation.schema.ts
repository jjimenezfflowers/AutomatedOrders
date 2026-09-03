import { z } from 'zod';

/*
 * The product form as a Zod schema.
 *
 * Everything here feeds a Playwright run: the URL is navigated to, the selectors
 * are handed to page.locator(), and the quantity is typed into the storefront. A
 * bad value does not fail in this form — it fails mid-run, as a navigation to
 * nowhere or a locator that matches nothing.
 *
 * Written against Zod 4: failures carry `error.issues`, and `.pipe` short-circuits
 * so a blank field reports "required" rather than also complaining about format.
 */

/** Trimmed and non-empty, with the field's own name in the message. */
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required.`);

/**
 * Product ids are Shopify handles — they end up in the storefront URL, so the same
 * characters a handle allows.
 */
export const productIdSchema = requiredText('Product ID').pipe(
  z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers and hyphens, like white-spray-roses.',
    ),
);

export const productUrlSchema = requiredText('URL').pipe(
  z
    .url('Enter a valid URL, including https://')
    .refine((value) => /^https?:\/\//i.test(value), 'Use an http or https URL.'),
);

/*
 * A selector that does not parse throws out of page.locator() during a run, which
 * surfaces as a Playwright error rather than as anything about this product. The
 * browser's own parser is the authority, so ask it.
 */
function isValidSelector(value: string): boolean {
  if (typeof document === 'undefined') return true;
  try {
    document.querySelector(value);
    return true;
  } catch {
    return false;
  }
}

const selectorMessage = 'That is not a valid CSS selector.';

export const quantitySelectorSchema = requiredText('Quantity selector').pipe(
  z.string().refine(isValidSelector, selectorMessage),
);

/** Optional: products without variants do not need one. */
export const variantSelectorSchema = z
  .string()
  .refine((value) => !value.trim() || isValidSelector(value), selectorMessage);

export const defaultQuantitySchema = z.coerce
  .number('Default quantity must be a whole number, 1 or more.')
  .int('Default quantity must be a whole number, 1 or more.')
  .min(1, 'Default quantity must be a whole number, 1 or more.');

export const productSchema = z.object({
  id: productIdSchema,
  name: requiredText('Name'),
  url: productUrlSchema,
  variantSelector: variantSelectorSchema.optional(),
  quantitySelector: quantitySelectorSchema,
  defaultQuantity: defaultQuantitySchema,
});

export type ProductFormValues = z.infer<typeof productSchema>;

/** Template order, so "first invalid" means topmost in the form. */
export const PRODUCT_FIELDS = Object.keys(productSchema.shape) as (keyof ProductFormValues)[];

/** The control each field focuses, which is not derivable from the field name. */
export const PRODUCT_FIELD_CONTROLS: Record<string, string> = {
  id: 'product-id',
  name: 'product-name',
  url: 'product-url',
  variantSelector: 'product-variant-selector',
  quantitySelector: 'product-quantity-selector',
  defaultQuantity: 'product-default-quantity',
};

function firstMessage(result: z.ZodSafeParseResult<unknown>): string | null {
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
}

export function productFieldError(field: keyof ProductFormValues, value: unknown): string | null {
  const shape = productSchema.shape[field] as z.ZodType;
  return firstMessage(shape.safeParse(value));
}

/**
 * Every message the form should show, keyed by field. Empty means it can be saved.
 *
 * `existingIds` are the ids already in the catalogue. A duplicate is not a format
 * problem — the products list deduplicates by id, so saving one would silently
 * drop a product rather than add one.
 */
export function productFormErrors(
  values: Partial<ProductFormValues>,
  options: { existingIds?: string[] } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of PRODUCT_FIELDS) {
    const message = productFieldError(field, values[field]);
    if (message) errors[field] = message;
  }

  const id = (values.id ?? '').trim();
  if (!errors['id'] && id && options.existingIds?.includes(id)) {
    errors['id'] = 'A product with that ID already exists.';
  }

  return errors;
}
