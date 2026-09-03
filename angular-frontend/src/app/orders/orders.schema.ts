import { z } from 'zod';

/*
 * The order form as a Zod schema.
 *
 * Like the staging one, this mirrors the payload posted to /api/order-config,
 * because that JSON is what the Playwright run reads back. A blank delivery date
 * or a zero quantity does not fail here — it fails in the checkout run, at the
 * calendar or the quantity control, minutes later.
 *
 * Written against Zod 4: failures carry `error.issues`, and `.pipe` short-circuits
 * so a blank field reports "required" rather than also complaining about format.
 */

/** Trimmed and non-empty, with the field's own name in the message. */
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required.`);

/*
 * The date pickers hand back ISO strings, and the spec's parseDeliveryDate reads
 * the same format. Anything else means something wrote to the model directly.
 */
export const deliveryDateSchema = requiredText('Delivery date').pipe(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD form.')
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      );
    }, 'That date does not exist.'),
);

/**
 * Optional on purpose: a blank quantity box still falls back to 1 when the order is
 * saved. What is rejected is a value that was typed and is unusable.
 */
export const quantitySchema = z
  .number('Quantity must be a whole number, 1 or more.')
  .int('Quantity must be a whole number, 1 or more.')
  .min(1, 'Quantity must be a whole number, 1 or more.')
  .optional();

export const orderItemSchema = z.object({
  productId: z.string(),
  quantity: quantitySchema,
  deliveryDate: deliveryDateSchema.optional(),
});

export const orderConfigSchema = z.object({
  deliveryDate: deliveryDateSchema,
  orders: z.array(orderItemSchema).min(1, 'Select at least one product.'),
});

export type OrderConfigValues = z.infer<typeof orderConfigSchema>;

function firstMessage(result: z.ZodSafeParseResult<unknown>): string | null {
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
}

export function deliveryDateError(value: string): string | null {
  return firstMessage(deliveryDateSchema.safeParse(value));
}

/**
 * Blank is allowed and saves as 1; a typed-but-unusable value is not.
 *
 * An empty number input reads back as NaN, which is the same situation as blank —
 * the save coerces it to 1 — so it is treated as absent rather than rejected.
 */
export function quantityError(value: number | null | undefined): string | null {
  const absent = value === null || value === undefined || Number.isNaN(value);
  return firstMessage(quantitySchema.safeParse(absent ? undefined : value));
}

/** Keys a per-item error so one map covers the whole form. */
export function quantityField(productId: string): string {
  return `quantity-${productId}`;
}

export function deliveryDateField(productId: string): string {
  return `deliveryDate-${productId}`;
}

export interface OrderFormValues {
  deliveryDate: string;
  orders: { productId: string; quantity?: number | null; deliveryDate?: string }[];
}

/**
 * Every message the form should show, keyed by field. Empty means it can be saved.
 * Per-item dates are optional here because an item without one inherits the main
 * delivery date, which is validated on its own.
 */
export function orderFormErrors(values: OrderFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  const main = deliveryDateError(values.deliveryDate);
  if (main) errors['deliveryDate'] = main;

  for (const item of values.orders) {
    const quantity = quantityError(item.quantity);
    if (quantity) errors[quantityField(item.productId)] = quantity;

    if (item.deliveryDate) {
      const date = deliveryDateError(item.deliveryDate);
      if (date) errors[deliveryDateField(item.productId)] = date;
    }
  }

  return errors;
}
