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
    expect(placeOrderButton().textContent).toContain('🚀 Place Staging Order');
  });

  it('disables the Place Staging Order button while a run is in flight', () => {
    completeInit();

    component.runTest();
    detect();

    expect(component.isRunning).toBeTrue();
    expect(placeOrderButton().disabled).toBeTrue();
    expect(placeOrderButton().textContent).toContain('⏳ Running...');

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
});
