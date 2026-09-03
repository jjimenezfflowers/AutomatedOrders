import { z } from 'zod';

/*
 * Field rules, backed by Zod schemas.
 *
 * These exist because the values here are typed into a real Shopify checkout by
 * Playwright. A malformed expiry or ZIP does not fail in the app — it fails
 * minutes later at the payment step, with whatever the storefront chooses to say.
 *
 * The rules stay `(value) => message | null` rather than exposing schemas to the
 * templates: that is exactly what ui-field's `error` input takes, so a form binds
 * one function per field and nothing has to know about Zod.
 *
 * Written against Zod 4, where `z.email()` is a top-level function rather than
 * `z.string().email()`, and failures carry `error.issues`.
 */

export type FieldRule = (value: string) => string | null;

/** Turns a schema into a rule, reporting its first issue. */
function rule<T extends z.ZodType>(schema: T): FieldRule {
  return (value) => {
    const result = schema.safeParse(value);
    return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value.');
  };
}

/** Blank passes every rule but `required`, so optional fields stay optional. */
function optional<T extends z.ZodType>(schema: T): FieldRule {
  const check = rule(schema);
  return (value) => (!value || !value.trim() ? null : check(value.trim()));
}

export function required(label: string): FieldRule {
  return rule(z.string().trim().min(1, `${label} is required.`));
}

/**
 * Zod's own email pattern, which is deliberately permissive: enough to catch a
 * missing @ or a trailing comma, not a spec-complete grammar that rejects
 * addresses real mail servers accept.
 */
export const email: FieldRule = optional(z.email('Enter a valid email address.'));

/** US-shaped: 10 digits, however they are punctuated. */
export const phone: FieldRule = optional(
  z
    .string()
    .refine((value) => value.replace(/\D/g, '').length === 10, 'Enter a 10-digit phone number.'),
);

export const zipCode: FieldRule = optional(
  z.string().regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit ZIP code.'),
);

export const url: FieldRule = optional(
  z
    .url('Enter a valid URL, including https://')
    .refine(
      (value) => /^https?:\/\//i.test(value),
      'Use an http or https URL.',
    ),
);

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

export const cardNumber: FieldRule = optional(
  z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((digits) => /^\d+$/.test(digits), 'Card number can only contain digits.')
    .refine(
      (digits) => digits.length >= 13 && digits.length <= 19,
      'Card number should be 13 to 19 digits.',
    )
    .refine(passesLuhn, 'That card number fails its checksum — check for a typo.'),
);

/** The spec types this straight into Shopify's expiry field, which wants MMYY. */
export const expiryMMYY: FieldRule = optional(
  z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((digits) => digits.length === 4, 'Use MMYY, for example 1226.')
    .refine((digits) => {
      const month = Number(digits.slice(0, 2));
      return month >= 1 && month <= 12;
    }, 'Month must be between 01 and 12.'),
);

export const cvv: FieldRule = optional(z.string().regex(/^\d{3,4}$/, 'CVV is 3 or 4 digits.'));

export function positiveInteger(label: string): FieldRule {
  return optional(
    z
      .string()
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) >= 1,
        `${label} must be a whole number, 1 or more.`,
      ),
  );
}

/** Runs several rules and reports the first failure, so one message shows at a time. */
export function firstError(value: string, ...rules: FieldRule[]): string | null {
  for (const check of rules) {
    const message = check(value);
    if (message) return message;
  }
  return null;
}
