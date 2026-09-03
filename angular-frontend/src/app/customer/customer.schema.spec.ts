import {
  CUSTOMER_FIELDS,
  CustomerField,
  CustomerFormValues,
  customerFieldError,
  customerFormErrors,
  customerSchema,
} from './customer.schema';

const VALID: CustomerFormValues = {
  email: 'buyer@example.test',
  phone: '(555) 555-5555',
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: '124 Ben St',
  city: 'Bristol',
  state: 'CT',
  zipCode: '06830',
  cardNumber: '4242424242424242',
  expiry: '1226',
  cvv: '123'
};

describe('customerSchema', () => {
  it('parses a form the checkout would accept', () => {
    expect(customerSchema.safeParse(VALID).success).toBeTrue();
    expect(customerFormErrors(VALID)).toEqual({});
  });

  it('covers every control on the form, in template order', () => {
    expect(CUSTOMER_FIELDS).toEqual([
      'email', 'phone', 'firstName', 'lastName',
      'address', 'city', 'state', 'zipCode',
      'cardNumber', 'expiry', 'cvv'
    ]);
  });

  it('names the field in every required message', () => {
    const blank = Object.fromEntries(CUSTOMER_FIELDS.map(f => [f, ''])) as CustomerFormValues;

    expect(customerFormErrors(blank)).toEqual({
      email: 'Email is required.',
      phone: 'Phone is required.',
      firstName: 'First name is required.',
      lastName: 'Last name is required.',
      address: 'Street address is required.',
      city: 'City is required.',
      state: 'State is required.',
      zipCode: 'ZIP code is required.',
      cardNumber: 'Card number is required.',
      expiry: 'Expiry is required.',
      cvv: 'CVV is required.'
    });
  });

  it('treats whitespace as empty', () => {
    expect(customerFieldError('city', '   ')).toBe('City is required.');
  });

  it('reports one message per field even when several rules fail', () => {
    // "abc" is not digits, is not 13-19 long, and fails Luhn. Only the first shows.
    expect(customerFieldError('cardNumber', 'abc')).toBe('Card number can only contain digits.');
  });

  describe('rejects', () => {
    const cases: { field: CustomerField; value: string; expected: string }[] = [
      { field: 'email', value: 'buyer.example.test', expected: 'Enter a valid email address.' },
      { field: 'email', value: 'buyer@', expected: 'Enter a valid email address.' },
      { field: 'phone', value: '555-5555', expected: 'Enter a 10-digit phone number.' },
      { field: 'zipCode', value: '100', expected: 'Enter a 5-digit ZIP code.' },
      { field: 'zipCode', value: 'ABCDE', expected: 'Enter a 5-digit ZIP code.' },
      {
        field: 'cardNumber',
        value: '4242424242424241',
        expected: 'That card number fails its checksum — check for a typo.'
      },
      {
        field: 'cardNumber',
        value: '4242',
        expected: 'Card number should be 13 to 19 digits.'
      },
      { field: 'expiry', value: '1326', expected: 'Month must be between 01 and 12.' },
      { field: 'expiry', value: '0026', expected: 'Month must be between 01 and 12.' },
      { field: 'expiry', value: '126', expected: 'Use MMYY, for example 1226.' },
      { field: 'cvv', value: '12', expected: 'CVV is 3 or 4 digits.' },
      { field: 'cvv', value: '12a', expected: 'CVV is 3 or 4 digits.' }
    ];

    for (const { field, value, expected } of cases) {
      it(`${field} "${value}"`, () => {
        expect(customerFieldError(field, value)).toBe(expected);
      });
    }
  });

  describe('accepts', () => {
    const cases: { field: CustomerField; value: string }[] = [
      { field: 'phone', value: '5555555555' },
      { field: 'phone', value: '(555) 555-5555' },
      { field: 'zipCode', value: '06830' },
      { field: 'zipCode', value: '06830-1234' },
      { field: 'cardNumber', value: '4242 4242 4242 4242' },
      { field: 'cardNumber', value: '4242-4242-4242-4242' },
      // 13 digits, the shortest a card can be, and Luhn-valid.
      { field: 'cardNumber', value: '4222222222222' },
      { field: 'expiry', value: '0126' },
      { field: 'expiry', value: '12/26' },
      { field: 'cvv', value: '1234' }
    ];

    for (const { field, value } of cases) {
      it(`${field} "${value}"`, () => {
        expect(customerFieldError(field, value)).toBeNull();
      });
    }
  });
});
