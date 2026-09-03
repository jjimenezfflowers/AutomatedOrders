import { z } from 'zod';

/*
 * The customer + payment form as a Zod schema.
 *
 * These values are typed into a real Shopify checkout by Playwright. A malformed
 * expiry or ZIP does not fail here — it fails minutes later at the payment step,
 * with whatever the storefront chooses to say about it. So every message is written
 * for the person who has to fix it, not for a logger.
 *
 * Written against Zod 4: `z.email()` is a top-level function rather than
 * `z.string().email()`, and failures carry `error.issues`.
 *
 * The shape is flat rather than mirroring the saved `{ customerInfo, payment }`
 * config, because the form is one screen with one save button and one error map;
 * the component splits the two halves back out when it posts.
 */

/** Trimmed and non-empty, with the field's own name in the message. */
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required.`);

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/** Luhn, so a transposed digit is caught here rather than at the checkout. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

export const customerSchema = z.object({
  /*
   * `.pipe` rather than another check: it short-circuits, so an empty box says
   * "Email is required." instead of also complaining about the format.
   */
  email: requiredText('Email').pipe(z.email('Enter a valid email address.')),

  /** US-shaped: 10 digits, however they are punctuated. */
  phone: requiredText('Phone').refine(
    (value) => digitsOnly(value).length === 10,
    'Enter a 10-digit phone number.',
  ),

  firstName: requiredText('First name'),
  lastName: requiredText('Last name'),
  address: requiredText('Street address'),
  city: requiredText('City'),
  state: requiredText('State'),

  zipCode: requiredText('ZIP code').regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit ZIP code.'),

  cardNumber: requiredText('Card number')
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((digits) => /^\d+$/.test(digits), 'Card number can only contain digits.')
    .refine(
      (digits) => digits.length >= 13 && digits.length <= 19,
      'Card number should be 13 to 19 digits.',
    )
    .refine(passesLuhn, 'That card number fails its checksum — check for a typo.'),

  /** The spec types this straight into Shopify's expiry field, which wants MMYY. */
  expiry: requiredText('Expiry')
    .transform(digitsOnly)
    .refine((digits) => digits.length === 4, 'Use MMYY, for example 1226.')
    .refine((digits) => {
      const month = Number(digits.slice(0, 2));
      return month >= 1 && month <= 12;
    }, 'Month must be between 01 and 12.'),

  cvv: requiredText('CVV').regex(/^\d{3,4}$/, 'CVV is 3 or 4 digits.'),
});

export type CustomerField = keyof typeof customerSchema.shape;

/** What the form hands the schema: every control is a string. */
export type CustomerFormValues = Record<CustomerField, string>;

/**
 * Declaration order, which is also template order — so "the first invalid field"
 * means the topmost one on screen.
 */
export const CUSTOMER_FIELDS = Object.keys(customerSchema.shape) as CustomerField[];

/**
 * One field on its own, for validating a control the moment it is left. Reports the
 * first issue only: chained refinements all run, and stacking three messages under
 * one box helps nobody.
 */
export function customerFieldError(field: CustomerField, value: string): string | null {
  const result = customerSchema.shape[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
}

/** The whole form, for submit: every field's first message, keyed by field. */
export function customerFormErrors(
  values: CustomerFormValues,
): Partial<Record<CustomerField, string>> {
  const result = customerSchema.safeParse(values);
  if (result.success) return {};

  const errors: Partial<Record<CustomerField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as CustomerField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
