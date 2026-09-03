import {
  cardNumber,
  cvv,
  email,
  expiryMMYY,
  firstError,
  phone,
  positiveInteger,
  required,
  url,
  zipCode,
} from './validators';

/*
 * These rules guard values that Playwright types into a real Shopify checkout, so
 * the cases below are the ones that would otherwise fail minutes later at the
 * payment step rather than in the form.
 */
describe('field rules', () => {
  describe('required', () => {
    const rule = required('Email');

    it('rejects an empty value with the field name', () => {
      expect(rule('')).toBe('Email is required.');
    });

    it('rejects whitespace, which looks filled in but is not', () => {
      expect(rule('   ')).toBe('Email is required.');
    });

    it('accepts any non-blank value', () => {
      expect(rule('a')).toBeNull();
    });
  });

  describe('email', () => {
    it('accepts a normal address', () => {
      expect(email('jose@fiftyflowers.com')).toBeNull();
    });

    for (const bad of ['jose', 'jose@', '@fiftyflowers.com', 'jose fiftyflowers.com']) {
      it(`rejects ${JSON.stringify(bad)}`, () => {
        expect(email(bad)).toBe('Enter a valid email address.');
      });
    }

    it('leaves blank to required, so one field shows one message', () => {
      expect(email('')).toBeNull();
    });
  });

  describe('phone', () => {
    it('accepts a punctuated US number', () => {
      expect(phone('(208) 391-2924')).toBeNull();
    });

    it('accepts bare digits', () => {
      expect(phone('2083912924')).toBeNull();
    });

    it('rejects a short number', () => {
      expect(phone('208391')).toBe('Enter a 10-digit phone number.');
    });

    it('rejects a long number', () => {
      expect(phone('20839129245')).toBe('Enter a 10-digit phone number.');
    });
  });

  describe('zipCode', () => {
    it('accepts five digits', () => {
      expect(zipCode('06830')).toBeNull();
    });

    it('accepts ZIP+4', () => {
      expect(zipCode('06830-1234')).toBeNull();
    });

    it('rejects three digits', () => {
      expect(zipCode('068')).toBe('Enter a 5-digit ZIP code.');
    });

    it('rejects letters', () => {
      expect(zipCode('SW1A1')).toBe('Enter a 5-digit ZIP code.');
    });
  });

  describe('url', () => {
    it('accepts an https URL', () => {
      expect(url('https://bloom-brain-stage.myshopify.com/')).toBeNull();
    });

    it('rejects a bare domain, which is the common mistake here', () => {
      expect(url('bloom-brain-stage.myshopify.com')).toBe(
        'Enter a valid URL, including https://',
      );
    });

    it('rejects a non-web scheme', () => {
      expect(url('ftp://example.com')).toBe('Use an http or https URL.');
    });
  });

  describe('cardNumber', () => {
    it('accepts the Stripe test card the config ships with', () => {
      expect(cardNumber('4242424242424242')).toBeNull();
    });

    it('accepts it with spaces, as people paste it', () => {
      expect(cardNumber('4242 4242 4242 4242')).toBeNull();
    });

    it('catches a transposed digit through the checksum', () => {
      // 4242424242424422 is the test card with two digits swapped.
      expect(cardNumber('4242424242424422')).toBe(
        'That card number fails its checksum — check for a typo.',
      );
    });

    it('rejects letters', () => {
      expect(cardNumber('4242abcd42424242')).toBe('Card number can only contain digits.');
    });

    it('rejects a number that is too short to be a card', () => {
      expect(cardNumber('424242')).toBe('Card number should be 13 to 19 digits.');
    });
  });

  describe('expiryMMYY', () => {
    it('accepts the format the checkout wants', () => {
      expect(expiryMMYY('1226')).toBeNull();
    });

    it('accepts it typed with a slash', () => {
      expect(expiryMMYY('12/26')).toBeNull();
    });

    it('rejects a 13th month', () => {
      expect(expiryMMYY('1326')).toBe('Month must be between 01 and 12.');
    });

    it('rejects month zero', () => {
      expect(expiryMMYY('0026')).toBe('Month must be between 01 and 12.');
    });

    it('rejects a four-digit year, which is the usual slip', () => {
      expect(expiryMMYY('122026')).toBe('Use MMYY, for example 1226.');
    });
  });

  describe('cvv', () => {
    it('accepts three digits', () => {
      expect(cvv('123')).toBeNull();
    });

    it('accepts four, for Amex', () => {
      expect(cvv('1234')).toBeNull();
    });

    it('rejects two', () => {
      expect(cvv('12')).toBe('CVV is 3 or 4 digits.');
    });

    it('rejects letters', () => {
      expect(cvv('12a')).toBe('CVV is 3 or 4 digits.');
    });
  });

  describe('positiveInteger', () => {
    const rule = positiveInteger('Quantity');

    it('accepts a whole number', () => {
      expect(rule('3')).toBeNull();
    });

    it('rejects zero', () => {
      expect(rule('0')).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('rejects a negative', () => {
      expect(rule('-2')).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('rejects a fraction', () => {
      expect(rule('1.5')).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('leaves blank alone, since it falls back to 1 on save', () => {
      expect(rule('')).toBeNull();
    });
  });

  describe('firstError', () => {
    it('reports the first failure, so a field shows one message at a time', () => {
      expect(firstError('', required('Email'), email)).toBe('Email is required.');
    });

    it('falls through to the later rule once the earlier one passes', () => {
      expect(firstError('nope', required('Email'), email)).toBe('Enter a valid email address.');
    });

    it('returns null when every rule passes', () => {
      expect(firstError('jose@fiftyflowers.com', required('Email'), email)).toBeNull();
    });
  });
});
