import { z } from 'zod';

/*
 * The staging order form as a Zod schema.
 *
 * Unlike the customer form this one mirrors the payload that is posted to
 * /api/staging-order-config, because that is what the Playwright run reads back: a
 * base URL with no scheme or a zero quantity does not fail here, it fails in the
 * checkout run minutes later.
 *
 * Written against Zod 4: `z.url()` is a top-level function, and failures carry
 * `error.issues`.
 */

/** Trimmed and non-empty, with the field's own name in the message. */
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required.`);

/*
 * `.pipe` short-circuits, so an empty box says "Staging base URL is required."
 * rather than also complaining about the format. z.url() accepts any parseable
 * scheme, hence the refinement: the run rewrites product URLs with this value, so
 * an ftp:// origin would produce links nothing can open.
 */
export const stagingBaseUrlSchema = requiredText('Staging base URL').pipe(
  z
    .url('Enter a valid URL, including https://')
    .refine((value) => /^https?:\/\//i.test(value), 'Use an http or https URL.'),
);

/**
 * Optional on purpose: a blank quantity box still falls back to 1 when the config is
 * saved, exactly as it did before. What is rejected is a value that was typed and is
 * unusable — 0, 2.5, or a negative.
 */
export const quantitySchema = z
  .number('Quantity must be a whole number, 1 or more.')
  .int('Quantity must be a whole number, 1 or more.')
  .min(1, 'Quantity must be a whole number, 1 or more.')
  .optional();

export const stagingOrderSchema = z.object({
  stagingBaseUrl: stagingBaseUrlSchema,
  orders: z.array(
    z.object({
      productId: z.string(),
      quantity: quantitySchema,
    }),
  ),
});

export type StagingOrderValues = z.input<typeof stagingOrderSchema>;

/** The `errors` key for a product's quantity; the base URL is keyed by its own name. */
export function quantityField(productId: string): string {
  return `quantity-${productId}`;
}

export const STAGING_BASE_URL_FIELD = 'stagingBaseUrl';

export function stagingBaseUrlError(value: string): string | null {
  const result = stagingBaseUrlSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
}

/** ui-input hands back null for an emptied number box; the schema wants undefined. */
export function quantityError(value: number | null | undefined): string | null {
  const result = quantitySchema.safeParse(value ?? undefined);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
}

/**
 * The whole payload, for submit. Zod reports a quantity at `['orders', i, 'quantity']`;
 * the form is keyed by product, so the index is resolved back to a productId.
 */
export function stagingOrderErrors(values: StagingOrderValues): Record<string, string> {
  const result = stagingOrderSchema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const [head, index] = issue.path;
    const key =
      head === 'orders' && typeof index === 'number'
        ? quantityField(values.orders[index].productId)
        : String(head);

    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
