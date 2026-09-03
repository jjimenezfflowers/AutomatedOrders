import { productFieldError, productFormErrors } from './products-creation.schema';

/*
 * Everything here feeds a Playwright run: the URL is navigated to, the selectors
 * are handed to page.locator(), the quantity is typed into the storefront. Each
 * case below is one that would otherwise fail mid-run rather than in the form.
 *
 * Checked against products.json: all 24 real products satisfy every rule.
 */
describe('product form schema', () => {
  const valid = {
    id: 'white-spray-roses',
    name: 'White Spray Roses',
    url: 'https://bloom-brain-dev.myshopify.com/products/white-spray-roses',
    variantSelector: '#option-0',
    quantitySelector: '#quantity-123',
    defaultQuantity: 1,
  };

  it('accepts a product shaped like the real ones', () => {
    expect(productFormErrors(valid)).toEqual({});
  });

  describe('id', () => {
    it('requires one', () => {
      expect(productFieldError('id', '')).toBe('Product ID is required.');
    });

    it('accepts a handle', () => {
      expect(productFieldError('id', 'babys-breath-flower-new-love-3')).toBeNull();
    });

    it('rejects spaces, which cannot appear in a storefront URL', () => {
      expect(productFieldError('id', 'white spray roses')).toBe(
        'Use lowercase letters, numbers and hyphens, like white-spray-roses.',
      );
    });

    it('rejects capitals', () => {
      expect(productFieldError('id', 'White-Spray-Roses')).not.toBeNull();
    });

    it('rejects a trailing hyphen', () => {
      expect(productFieldError('id', 'roses-')).not.toBeNull();
    });
  });

  describe('url', () => {
    it('requires one', () => {
      expect(productFieldError('url', '')).toBe('URL is required.');
    });

    it('rejects a bare host, which navigates nowhere', () => {
      expect(productFieldError('url', 'bloom-brain-dev.myshopify.com')).toBe(
        'Enter a valid URL, including https://',
      );
    });

    it('rejects a non-web scheme', () => {
      expect(productFieldError('url', 'ftp://example.test/roses')).toBe(
        'Use an http or https URL.',
      );
    });
  });

  describe('selectors', () => {
    it('requires a quantity selector, since the run types into it', () => {
      expect(productFieldError('quantitySelector', '')).toBe('Quantity selector is required.');
    });

    it('rejects a selector the browser cannot parse', () => {
      // This throws out of page.locator() mid-run, as a Playwright error that says
      // nothing about which product caused it.
      expect(productFieldError('quantitySelector', '#quantity[')).toBe(
        'That is not a valid CSS selector.',
      );
    });

    it('accepts an attribute selector', () => {
      expect(productFieldError('quantitySelector', 'input[name="quantity"]')).toBeNull();
    });

    it('leaves the variant selector optional, since not every product has variants', () => {
      expect(productFieldError('variantSelector', '')).toBeNull();
    });

    it('still rejects an unparseable variant selector when one is given', () => {
      expect(productFieldError('variantSelector', 'div::')).toBe(
        'That is not a valid CSS selector.',
      );
    });
  });

  describe('defaultQuantity', () => {
    it('accepts a whole number', () => {
      expect(productFieldError('defaultQuantity', 2)).toBeNull();
    });

    for (const bad of [0, -1, 1.5]) {
      it(`rejects ${bad}`, () => {
        expect(productFieldError('defaultQuantity', bad)).toBe(
          'Default quantity must be a whole number, 1 or more.',
        );
      });
    }
  });

  describe('duplicate ids', () => {
    /*
     * The products list deduplicates by id, so saving a duplicate would silently
     * drop a product rather than add one — no error, one fewer product.
     */
    it('rejects an id already in the catalogue', () => {
      const errors = productFormErrors(valid, { existingIds: ['white-spray-roses'] });

      expect(errors['id']).toBe('A product with that ID already exists.');
    });

    it('accepts an id that is not taken', () => {
      expect(productFormErrors(valid, { existingIds: ['tulips'] })).toEqual({});
    });

    it('reports the format problem first, since that is the more basic one', () => {
      const errors = productFormErrors(
        { ...valid, id: 'White Roses' },
        { existingIds: ['White Roses'] },
      );

      expect(errors['id']).toContain('lowercase letters');
    });
  });

  it('collects every problem at once, so a save reports all of them', () => {
    const errors = productFormErrors({
      id: '',
      name: '',
      url: 'nope',
      quantitySelector: '',
      defaultQuantity: 0,
    });

    expect(Object.keys(errors).sort()).toEqual([
      'defaultQuantity',
      'id',
      'name',
      'quantitySelector',
      'url',
    ]);
  });
});
