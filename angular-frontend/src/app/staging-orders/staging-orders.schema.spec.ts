import {
  StagingOrderValues,
  quantityError,
  quantityField,
  stagingBaseUrlError,
  stagingOrderErrors,
  stagingOrderSchema
} from './staging-orders.schema';

const VALID: StagingOrderValues = {
  stagingBaseUrl: 'https://staging.test',
  orders: [
    { productId: 'roses', quantity: 2 },
    { productId: 'tulips', quantity: 1 }
  ]
};

describe('stagingOrderSchema', () => {
  it('parses a config the checkout run could use', () => {
    expect(stagingOrderSchema.safeParse(VALID).success).toBeTrue();
    expect(stagingOrderErrors(VALID)).toEqual({});
  });

  it('parses an empty order list, which is the state before anything is selected', () => {
    expect(stagingOrderErrors({ stagingBaseUrl: 'https://staging.test', orders: [] })).toEqual({});
  });

  describe('the staging base url', () => {
    it('is required', () => {
      expect(stagingBaseUrlError('')).toBe('Staging base URL is required.');
      expect(stagingBaseUrlError('   ')).toBe('Staging base URL is required.');
    });

    it('rejects a bare host, which is the mistake this catches', () => {
      expect(stagingBaseUrlError('staging-store.myshopify.com')).toBe(
        'Enter a valid URL, including https://'
      );
    });

    it('rejects a scheme the storefront cannot be opened with', () => {
      expect(stagingBaseUrlError('ftp://staging-store.myshopify.com')).toBe(
        'Use an http or https URL.'
      );
    });

    it('accepts http and https, with or without a path', () => {
      expect(stagingBaseUrlError('https://staging-store.myshopify.com')).toBeNull();
      expect(stagingBaseUrlError('http://localhost:3000')).toBeNull();
      expect(stagingBaseUrlError('  https://staging.test/shop  ')).toBeNull();
    });
  });

  describe('a per-item quantity', () => {
    it('rejects zero, a negative and a fraction', () => {
      const expected = 'Quantity must be a whole number, 1 or more.';

      expect(quantityError(0)).toBe(expected);
      expect(quantityError(-1)).toBe(expected);
      expect(quantityError(2.5)).toBe(expected);
    });

    it('accepts any whole number from one up', () => {
      expect(quantityError(1)).toBeNull();
      expect(quantityError(99)).toBeNull();
    });

    /*
     * An emptied number box reads back as null, and a product loaded without a
     * defaultQuantity has none at all. Both still save as 1, as they always have.
     */
    it('leaves a blank box alone', () => {
      expect(quantityError(null)).toBeNull();
      expect(quantityError(undefined)).toBeNull();
    });
  });

  it('keys a quantity message by product, not by its index in the list', () => {
    const errors = stagingOrderErrors({
      stagingBaseUrl: 'https://staging.test',
      orders: [
        { productId: 'roses', quantity: 2 },
        { productId: 'tulips', quantity: 0 }
      ]
    });

    expect(errors).toEqual({
      [quantityField('tulips')]: 'Quantity must be a whole number, 1 or more.'
    });
  });

  it('reports the url and a quantity together, so one save shows both', () => {
    const errors = stagingOrderErrors({
      stagingBaseUrl: 'staging-store.myshopify.com',
      orders: [{ productId: 'roses', quantity: 0 }]
    });

    expect(errors['stagingBaseUrl']).toBe('Enter a valid URL, including https://');
    expect(errors[quantityField('roses')]).toBe('Quantity must be a whole number, 1 or more.');
  });
});
