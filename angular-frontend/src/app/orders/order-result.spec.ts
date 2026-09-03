import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrderResultComponent, PlacedOrder } from './order-result';

describe('OrderResultComponent', () => {
  let fixture: ComponentFixture<OrderResultComponent>;
  let component: OrderResultComponent;

  const ORDER: PlacedOrder = {
    orderNumber: 'DEV-BB-50F5474',
    confirmationNumber: 'FUY0HXCMI',
    orderId: 'gid://shopify/Order/6103339008140',
    adminUrl: 'https://admin.shopify.com/store/bloom-brain-dev/orders/6103339008140',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    destination: 'Bristol, CT, US',
    shippingMethod: 'Free Express Shipping',
    subtotal: '108.00 USD',
    shipping: '0.00 USD',
    tax: '6.86 USD',
    discounts: '11.99 USD',
    total: '114.86 USD',
    matchedBy: 'cartToken',
    source: 'api',
    lineItems: [
      {
        title: 'Floreana White Spray Roses',
        quantity: 1,
        variant: '20 stems (2 Bunches)',
        sku: 'FF-VAR-10197',
        unitPrice: '119.99 USD',
        image: 'https://cdn.shopify.com/roses.webp',
      },
    ],
  };

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function testId<T extends HTMLElement>(id: string): T | null {
    return query(`[data-testid="${id}"]`);
  }

  function show(order: PlacedOrder | null, error: string | null = null) {
    component.order = order;
    component.error = error;
    detect();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderResultComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderResultComponent);
    component = fixture.componentInstance;
    detect();
  });

  describe('before a run has finished', () => {
    it('renders nothing at all', () => {
      expect(testId('order-result')).toBeNull();
      expect(testId('order-result-error')).toBeNull();
    });
  });

  describe('a placed order', () => {
    beforeEach(() => show(ORDER));

    it('leads with the order number and the confirmation reference', () => {
      expect(testId('order-result-number')!.textContent).toContain('DEV-BB-50F5474');
      expect(testId('order-result-confirmation')!.textContent).toContain('FUY0HXCMI');
    });

    it('shows both statuses in words rather than SCREAMING_CASE', () => {
      expect(testId('order-result-financial')!.textContent!.trim()).toBe('Paid');
      expect(testId('order-result-fulfillment')!.textContent!.trim()).toBe('Unfulfilled');
    });

    it('links to the order in Shopify Admin', () => {
      const link = testId<HTMLAnchorElement>('order-result-admin-link')!;

      expect(link.href).toBe(
        'https://admin.shopify.com/store/bloom-brain-dev/orders/6103339008140',
      );
      expect(link.target).toBe('_blank');
      // Without noopener the opened tab can reach back into this one.
      expect(link.rel).toContain('noopener');
    });

    it('breaks the total down rather than showing one number', () => {
      const totals = testId('order-result-totals')!.textContent ?? '';

      expect(totals).toContain('108.00 USD');
      expect(totals).toContain('11.99 USD');
      expect(totals).toContain('6.86 USD');
      expect(testId('order-result-total')!.textContent).toContain('114.86 USD');
    });

    it('names the shipping method beside its cost', () => {
      expect(testId('order-result-totals')!.textContent).toContain('Free Express Shipping');
    });

    it('lists what the store charged for, with SKU and unit price', () => {
      const items = testId('order-result-items')!.textContent ?? '';

      expect(items).toContain('Floreana White Spray Roses');
      expect(items).toContain('20 stems (2 Bunches)');
      expect(items).toContain('FF-VAR-10197');
      expect(items).toContain('119.99 USD');
    });

    it('says how the order was identified, so a guess never reads as certain', () => {
      expect(testId('order-result-provenance')!.textContent).toContain('cart token');
    });
  });

  describe('a weakly identified order', () => {
    it('says plainly that the match was not exact', () => {
      show({ ...ORDER, matchedBy: 'mostRecent' });

      expect(testId('order-result-provenance')!.textContent).toContain('not an exact match');
    });

    it('says when the number came off the page instead of the store', () => {
      show({ ...ORDER, source: 'page', matchedBy: null });

      expect(testId('order-result-provenance')!.textContent).toContain('confirmation page');
    });
  });

  describe('an order recorded before the API integration', () => {
    const legacy: PlacedOrder = { orderNumber: 'DEV-BB-OLD', total: 'N/A' };

    beforeEach(() => show(legacy));

    it('still renders, with the fields it has', () => {
      expect(testId('order-result-number')!.textContent).toContain('DEV-BB-OLD');
    });

    it('offers no Admin link rather than a broken one', () => {
      expect(testId('order-result-admin-link')).toBeNull();
    });

    it('shows a dash where a value was never recorded', () => {
      expect(testId('order-result-confirmation')!.textContent!.trim()).toBe('—');
    });

    it('shows no status badges it cannot vouch for', () => {
      expect(testId('order-result-financial')).toBeNull();
      expect(testId('order-result-fulfillment')).toBeNull();
    });
  });

  describe('a failed run', () => {
    beforeEach(() => show(null, 'TimeoutError: locator.waitFor exceeded'));

    it('shows the run output instead of an order', () => {
      expect(testId('order-result')).toBeNull();
      expect(testId('order-result-error-output')!.textContent).toContain('TimeoutError');
    });

    it('points at the Logs page for the rest', () => {
      expect(testId('order-result-error')!.textContent).toContain('Logs');
    });

    it('prefers the error when both are somehow set', () => {
      // A stale success must never sit under a fresh failure.
      show(ORDER, 'boom');

      expect(testId('order-result')).toBeNull();
      expect(testId('order-result-error')).not.toBeNull();
    });
  });

  describe('a discount-free order', () => {
    it('hides the discount line rather than showing a zero', () => {
      show({ ...ORDER, discounts: '0.00 USD' });

      expect(testId('order-result-totals')!.textContent).not.toContain('Discounts');
    });
  });
});
