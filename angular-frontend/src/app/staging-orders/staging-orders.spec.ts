import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { StagingOrdersComponent } from './staging-orders';

const PRODUCTS = [
  {
    id: 'roses',
    name: 'Roses',
    url: 'https://staging.test/roses',
    quantitySelector: '#qty',
    defaultQuantity: 2
  }
];

const CONFIG = {
  stagingBaseUrl: 'https://staging.test',
  deliveryDate: '2026-01-10',
  orders: [{ productId: 'roses', quantity: 2 }]
};

describe('StagingOrdersComponent', () => {
  let component: StagingOrdersComponent;
  let fixture: ComponentFixture<StagingOrdersComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function completeInit() {
    httpMock.expectOne('/api/staging-products').flush(PRODUCTS);
    httpMock.expectOne('/api/staging-order-config').flush(CONFIG);
    detect();
  }

  function placeOrderButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      'button[data-testid="place-staging-order"]'
    ) as HTMLButtonElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StagingOrdersComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    spyOn(window, 'alert');

    fixture = TestBed.createComponent(StagingOrdersComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    detect();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    completeInit();
    expect(component).toBeTruthy();
  });

  // --- Defect 5: restored in-flight guard -----------------------------------------

  it('starts with isRunning false and an enabled button', () => {
    completeInit();

    expect(component.isRunning).toBeFalse();
    expect(placeOrderButton().disabled).toBeFalse();
    expect(placeOrderButton().textContent).toContain('Place Staging Order');
    expect(placeOrderButton().getAttribute('aria-busy')).toBeNull();
  });

  it('disables the Place Staging Order button while a run is in flight', () => {
    completeInit();

    component.runTest();
    detect();

    expect(component.isRunning).toBeTrue();
    expect(placeOrderButton().disabled).toBeTrue();
    // ui-button keeps the label static and signals the run with a spinner + aria-busy.
    expect(placeOrderButton().getAttribute('aria-busy')).toBe('true');
    expect(placeOrderButton().textContent).toContain('Place Staging Order');

    httpMock.expectOne('/api/run-test').flush({ success: true });
    detect();

    expect(component.isRunning).toBeFalse();
    expect(placeOrderButton().disabled).toBeFalse();
  });

  it('clears isRunning when the run fails', () => {
    completeInit();

    component.runTest();
    httpMock.expectOne('/api/run-test').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(component.isRunning).toBeFalse();
    expect(component.testSuccess).toBeFalse();
  });

  it('clears isRunning when the run reports failure', () => {
    completeInit();

    component.runTest();
    httpMock.expectOne('/api/run-test').flush({ success: false, output: 'cart empty' });

    expect(component.isRunning).toBeFalse();
    expect(component.testOutput).toBe('cart empty');
  });

  it('stays disabled while stagingBaseUrl is empty', () => {
    completeInit();

    component.stagingBaseUrl = '';
    detect();

    expect(placeOrderButton().disabled).toBeTrue();
  });

  it('does not start a run without a staging base url', () => {
    completeInit();

    component.stagingBaseUrl = '';
    component.runTest();

    httpMock.expectNone('/api/run-test');
    expect(component.isRunning).toBeFalse();
  });

  it('saves the on-screen config', () => {
    completeInit();

    component.orderItems[0].quantity = 7;
    component.saveConfig();

    const post = httpMock.expectOne('/api/staging-order-config');
    expect(post.request.body.orders).toEqual([{ productId: 'roses', quantity: 7 }]);
    post.flush({});
  });

  describe('loadProducts', () => {
    // Same defect as the Orders tab: staging deduplicated by name as well as by id,
    // so the second of two products sharing a name was unselectable here too.
    function flushInit(products: unknown[]) {
      httpMock.expectOne('/api/staging-products').flush(products);
      httpMock.expectOne('/api/staging-order-config').flush(CONFIG);
      detect();
    }

    it('keeps both products that share a name but have distinct ids', () => {
      flushInit([
        { id: 'babys-breath-flower-new-love-3', name: "Baby's Breath Flower New Love", url: 'a' },
        { id: 'babys-breath-flower-new-love', name: "Baby's Breath Flower New Love", url: 'b' }
      ]);

      expect(component.products.map(p => p.id)).toEqual([
        'babys-breath-flower-new-love-3',
        'babys-breath-flower-new-love'
      ]);
    });

    it('still collapses exact duplicates by id', () => {
      flushInit([
        { id: 'roses', name: 'Roses', url: 'a' },
        { id: 'roses', name: 'Roses', url: 'a' }
      ]);

      expect(component.products.length).toBe(1);
    });
  });

  // --- Design-system migration ------------------------------------------------------

  describe('design-system markup', () => {
    function query<T extends Element>(selector: string): T {
      return fixture.nativeElement.querySelector(selector) as T;
    }

    /** Types into a control the way a user would, so the CVA reports back to ngModel. */
    function type(input: HTMLInputElement, value: string) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('leaves no hand-written <button> outside ui-button', () => {
      completeInit();

      const all: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const owned: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('ui-button button')
      );

      expect(all.length).toBeGreaterThan(0);
      expect(owned.length).toBe(all.length);
      expect(owned.filter(b => b.textContent!.includes('Save Order')).length).toBe(1);
    });

    it('renders the Place Staging Order button through ui-button', () => {
      completeInit();

      expect(query('ui-button button[data-testid="place-staging-order"]')).toBeTruthy();
    });

    it('round-trips the delivery date through ui-input', async () => {
      completeInit();
      await fixture.whenStable();
      detect();

      const input = query<HTMLInputElement>('ui-input input#staging-delivery-date');
      expect(input.type).toBe('date');
      expect(input.value).toBe('2026-01-10');

      type(input, '2026-08-08');

      expect(component.deliveryDate).toBe('2026-08-08');
    });

    it('round-trips the staging base url through ui-input', async () => {
      completeInit();
      await fixture.whenStable();
      detect();

      const input = query<HTMLInputElement>('ui-input input#staging-base-url');
      expect(input.value).toBe('https://staging.test');

      type(input, 'https://other.test');

      expect(component.stagingBaseUrl).toBe('https://other.test');
    });

    it('round-trips a per-product quantity through ui-input', async () => {
      completeInit();
      await fixture.whenStable();
      detect();

      const input = query<HTMLInputElement>('ui-input input#staging-quantity-roses');
      expect(input.type).toBe('number');
      expect(input.value).toBe('2');

      type(input, '6');

      expect(component.orderItems[0].quantity).toBe(6);
    });

    it('selects products through ui-checkbox and resyncs the order items', async () => {
      completeInit();
      // ngModel writes into the control on a microtask; without settling first the
      // checkbox has not yet reflected the value loaded from the config.
      await fixture.whenStable();
      detect();

      const checkbox = query<HTMLInputElement>('ui-checkbox input#staging-product-roses');
      expect(checkbox.checked).toBeTrue();

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      expect(component.selectedProducts['roses']).toBeFalse();
      expect(component.orderItems.length).toBe(0);
    });

    it('renders no hardcoded surface colours, which is what would break dark mode', () => {
      completeInit();

      const html: string = fixture.nativeElement.innerHTML;

      expect(html).not.toContain('bg-white');
      expect(html).not.toMatch(/bg-yellow-/);
      expect(html).not.toMatch(/text-yellow-/);
      expect(html).not.toMatch(/border-yellow-/);
      // Variant-prefixed utilities (`disabled:border-gray-600`) belong to the
      // primitives' own disabled treatment; only unprefixed palette classes are
      // migration leftovers.
      expect(html).not.toMatch(/(?:^|[\s"])(?:bg|text|border)-(?:gray|slate)-\d/);
    });

    it('paints the staging accents with the warning token', () => {
      completeInit();

      const html: string = fixture.nativeElement.innerHTML;

      expect(html).toContain('bg-warning');
      expect(html).toContain('text-warning');
    });
  });
});
