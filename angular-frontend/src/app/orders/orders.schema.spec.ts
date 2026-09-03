import {
  deliveryDateError,
  orderFormErrors,
  quantityError,
  quantityField,
} from './orders.schema';

/*
 * These guard the JSON the Playwright run reads back, so the cases below are the
 * ones that would otherwise fail at the storefront's calendar or quantity control
 * minutes after the button was pressed.
 */
describe('order form schema', () => {
  describe('deliveryDateError', () => {
    it('accepts the ISO date the picker produces', () => {
      expect(deliveryDateError('2026-09-10')).toBeNull();
    });

    it('requires a date, naming the field', () => {
      expect(deliveryDateError('')).toBe('Delivery date is required.');
    });

    it('reports "required" rather than a format complaint when blank', () => {
      expect(deliveryDateError('   ')).toBe('Delivery date is required.');
    });

    it('rejects a display-formatted date, which the spec cannot parse', () => {
      expect(deliveryDateError('Sep 10, 2026')).toBe('Use a date in YYYY-MM-DD form.');
    });

    it('rejects a slash date', () => {
      expect(deliveryDateError('09/10/2026')).toBe('Use a date in YYYY-MM-DD form.');
    });

    it('rejects a date that does not exist', () => {
      expect(deliveryDateError('2026-02-31')).toBe('That date does not exist.');
    });

    it('rejects a thirteenth month', () => {
      expect(deliveryDateError('2026-13-01')).toBe('That date does not exist.');
    });

    it('accepts a leap day in a leap year', () => {
      expect(deliveryDateError('2028-02-29')).toBeNull();
    });

    it('rejects a leap day in a common year', () => {
      expect(deliveryDateError('2027-02-29')).toBe('That date does not exist.');
    });
  });

  describe('quantityError', () => {
    it('accepts a whole number', () => {
      expect(quantityError(3)).toBeNull();
    });

    it('allows absent, which the save turns into 1', () => {
      expect(quantityError(undefined)).toBeNull();
      expect(quantityError(null)).toBeNull();
    });

    it('allows NaN, which is what an unset quantity coerces to', () => {
      expect(quantityError(Number(undefined))).toBeNull();
    });

    it('still rejects a deliberately typed zero', () => {
      // The distinction that matters: blank is absent and saves as 1; 0 was typed.
      expect(quantityError(0)).not.toBeNull();
    });

    it('rejects zero', () => {
      expect(quantityError(0)).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('rejects a negative', () => {
      expect(quantityError(-1)).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('rejects a fraction', () => {
      expect(quantityError(1.5)).toBe('Quantity must be a whole number, 1 or more.');
    });
  });

  describe('orderFormErrors', () => {
    const item = (overrides: Record<string, unknown> = {}) => ({
      productId: 'roses',
      quantity: 1,
      ...overrides,
    });

    it('reports nothing for a valid order', () => {
      expect(orderFormErrors({ deliveryDate: '2026-09-10', orders: [item()] })).toEqual({});
    });

    it('reports a missing main delivery date', () => {
      const errors = orderFormErrors({ deliveryDate: '', orders: [item()] });

      expect(errors['deliveryDate']).toBe('Delivery date is required.');
    });

    it('keys a per-item quantity error by product, so the right row shows it', () => {
      const errors = orderFormErrors({
        deliveryDate: '2026-09-10',
        orders: [item({ productId: 'tulips', quantity: 0 })],
      });

      expect(errors[quantityField('tulips')]).toBe('Quantity must be a whole number, 1 or more.');
    });

    it('validates a per-item date only when one is set, since it otherwise inherits', () => {
      expect(
        orderFormErrors({ deliveryDate: '2026-09-10', orders: [item()] }),
      ).toEqual({});

      const errors = orderFormErrors({
        deliveryDate: '2026-09-10',
        orders: [item({ deliveryDate: '2026-02-31' })],
      });
      expect(errors['deliveryDate-roses']).toBe('That date does not exist.');
    });

    it('collects every problem at once, so a save reports all of them', () => {
      const errors = orderFormErrors({
        deliveryDate: '',
        orders: [item({ productId: 'a', quantity: 0 }), item({ productId: 'b', quantity: -2 })],
      });

      expect(Object.keys(errors).sort()).toEqual(['deliveryDate', 'quantity-a', 'quantity-b']);
    });
  });
});
