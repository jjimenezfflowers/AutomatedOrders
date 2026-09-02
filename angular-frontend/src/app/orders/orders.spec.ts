import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { OrdersComponent } from './orders';

const PRODUCTS = [
  {
    id: 'babys-breath-flower-new-love-3',
    name: "Baby's Breath Flower New Love",
    url: 'https://example.test/a',
    quantitySelector: '#qty',
    defaultQuantity: 1
  },
  {
    id: 'babys-breath-flower-new-love',
    name: "Baby's Breath Flower New Love",
    url: 'https://example.test/b',
    quantitySelector: '#qty',
    defaultQuantity: 2
  },
  {
    id: 'roses',
    name: 'Roses',
    url: 'https://example.test/roses',
    quantitySelector: '#qty',
    defaultQuantity: 3
  }
];

const STORED_CUSTOMER_INFO = {
  email: 'buyer@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace'
};

const STORED_PAYMENT = {
  cardNumber: '4111111111111111',
  cvv: '123',
  expiry: '12/30'
};

const STORED_CONFIG = {
  deliveryDate: '2026-01-10',
  customerInfo: STORED_CUSTOMER_INFO,
  payment: STORED_PAYMENT,
  orders: [{ productId: 'roses', quantity: 3, deliveryDate: '2026-01-10' }]
};

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  /** Flushes the two GETs issued by ngOnInit so the component reaches its loaded state. */
  function completeInit(config: Object = STORED_CONFIG, products: Object = PRODUCTS) {
    httpMock.expectOne('/api/products').flush(products);
    httpMock.expectOne('/api/order-config').flush(config);
    detect();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    spyOn(window, 'alert');

    fixture = TestBed.createComponent(OrdersComponent);
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

  // --- Defect 3: dedupe by id only -------------------------------------------------

  describe('loadProducts', () => {
    it('keeps both products that share a name but have distinct ids', () => {
      completeInit();

      expect(component.products.map(p => p.id)).toEqual([
        'babys-breath-flower-new-love-3',
        'babys-breath-flower-new-love',
        'roses'
      ]);
    });

    it('still collapses exact duplicates by id', () => {
      completeInit(STORED_CONFIG, [...PRODUCTS, { ...PRODUCTS[0] }]);

      expect(component.products.length).toBe(3);
      expect(component.products.filter(p => p.id === 'babys-breath-flower-new-love-3').length).toBe(1);
    });

    it('makes a saved order for the same-named duplicate id selectable and survivable across a save', () => {
      completeInit({
        ...STORED_CONFIG,
        orders: [
          { productId: 'babys-breath-flower-new-love-3', quantity: 1 },
          { productId: 'babys-breath-flower-new-love', quantity: 5 }
        ]
      });

      expect(component.orderItems.map(i => i.id)).toEqual([
        'babys-breath-flower-new-love-3',
        'babys-breath-flower-new-love'
      ]);

      component.saveOrder();
      httpMock.expectOne('/api/order-config').flush(STORED_CONFIG);
      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');

      expect(post.request.body.orders.map((o: { productId: string }) => o.productId)).toEqual([
        'babys-breath-flower-new-love-3',
        'babys-breath-flower-new-love'
      ]);
      post.flush({});
    });
  });

  // --- Defect 1: saveOrder must not destroy customerInfo / payment -----------------

  describe('saveOrder', () => {
    it('re-reads the stored config and preserves customerInfo and payment', () => {
      completeInit();

      component.deliveryDate = '2026-02-02';
      component.saveOrder();

      const get = httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config');
      get.flush(STORED_CONFIG);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');
      expect(post.request.body.customerInfo).toEqual(STORED_CUSTOMER_INFO);
      expect(post.request.body.payment).toEqual(STORED_PAYMENT);
      expect(post.request.body.deliveryDate).toBe('2026-02-02');
      post.flush({});
    });

    it('preserves customerInfo written after the component loaded its own copy', () => {
      completeInit({ ...STORED_CONFIG, customerInfo: {}, payment: {} });

      component.saveOrder();
      // Another tab (the Customer screen) saved credentials in the meantime.
      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');
      expect(post.request.body.customerInfo).toEqual(STORED_CUSTOMER_INFO);
      expect(post.request.body.payment).toEqual(STORED_PAYMENT);
      post.flush({});
    });

    it('refuses to save before the config GET has resolved', () => {
      httpMock.expectOne('/api/products').flush(PRODUCTS);
      const pendingConfig = httpMock.expectOne('/api/order-config');

      component.saveOrder();

      httpMock.expectNone(r => r.method === 'POST' && r.url === '/api/order-config');
      expect(window.alert).toHaveBeenCalled();
      expect(component.isSavingOrder).toBeFalse();

      pendingConfig.flush(STORED_CONFIG);
    });

    it('refuses to save when the config GET failed', () => {
      httpMock.expectOne('/api/products').flush(PRODUCTS);
      httpMock
        .expectOne('/api/order-config')
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(component.configLoaded).toBeFalse();

      component.saveOrder();
      httpMock.expectNone(r => r.method === 'POST' && r.url === '/api/order-config');
    });

    it('serialises the on-screen items, deduping by id and coercing quantity', () => {
      completeInit();

      component.orderItems = [
        { id: 'roses', name: 'Roses', quantity: 4, deliveryDate: '2026-03-01', variant: 'Large' },
        { id: 'roses', name: 'Roses', quantity: 9 },
        { id: 'tulips', name: 'Tulips', quantity: NaN }
      ];
      component.deliveryDate = '2026-03-01';
      component.saveOrder();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');

      expect(post.request.body.orders).toEqual([
        { productId: 'roses', quantity: 4, variant: 'Large', deliveryDate: '2026-03-01' },
        { productId: 'tulips', quantity: 1 }
      ]);
      post.flush({});
    });

    it('clears isSavingOrder and alerts when the POST fails', () => {
      completeInit();

      component.saveOrder();
      expect(component.isSavingOrder).toBeTrue();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      httpMock
        .expectOne(r => r.method === 'POST' && r.url === '/api/order-config')
        .flush('nope', { status: 500, statusText: 'Server Error' });

      expect(component.isSavingOrder).toBeFalse();
      expect(window.alert).toHaveBeenCalledWith(jasmine.stringMatching(/Failed to save order/));
    });
  });

  // --- Defect 2: runTest must persist first ----------------------------------------

  describe('runTest', () => {
    it('POSTs /api/order-config before /api/run-test', () => {
      completeInit();

      const requestOrder: string[] = [];
      component.runTest();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);

      const savePost = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');
      requestOrder.push(savePost.request.url);
      httpMock.expectNone('/api/run-test');
      savePost.flush({});

      const runPost = httpMock.expectOne('/api/run-test');
      requestOrder.push(runPost.request.url);
      runPost.flush({ success: true });

      expect(requestOrder).toEqual(['/api/order-config', '/api/run-test']);
    });

    it('sends the on-screen edits, not the previously saved order', () => {
      completeInit();

      component.orderItems[0].quantity = 42;
      component.orderItems[0].deliveryDate = '2026-04-04';
      component.runTest();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      const savePost = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');

      expect(savePost.request.body.orders).toEqual([
        { productId: 'roses', quantity: 42, deliveryDate: '2026-04-04' }
      ]);
      savePost.flush({});
      httpMock.expectOne('/api/run-test').flush({ success: true });
    });

    it('does not POST /api/run-test when the save fails', () => {
      completeInit();

      component.runTest();
      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      httpMock
        .expectOne(r => r.method === 'POST' && r.url === '/api/order-config')
        .flush('nope', { status: 500, statusText: 'Server Error' });

      httpMock.expectNone('/api/run-test');
      expect(component.isPlacingOrder).toBeFalse();
      expect(window.alert).toHaveBeenCalledWith(jasmine.stringMatching(/Failed to run test/));
    });

    it('does not POST /api/run-test when the pre-save GET fails', () => {
      completeInit();

      component.runTest();
      httpMock
        .expectOne(r => r.method === 'GET' && r.url === '/api/order-config')
        .flush('nope', { status: 500, statusText: 'Server Error' });

      httpMock.expectNone(r => r.method === 'POST' && r.url === '/api/order-config');
      httpMock.expectNone('/api/run-test');
      expect(component.isPlacingOrder).toBeFalse();
    });

    it('validates selection and delivery date before issuing any request', () => {
      completeInit();

      component.orderItems = [];
      component.runTest();
      httpMock.expectNone(r => r.method === 'POST');
      expect(window.alert).toHaveBeenCalledWith(
        'Please select at least one product before placing an order'
      );

      component.orderItems = [{ id: 'roses', name: 'Roses', quantity: 1 }];
      component.deliveryDate = '';
      component.runTest();
      httpMock.expectNone(r => r.method === 'POST');
      expect(window.alert).toHaveBeenCalledWith('Please select a delivery date');
      expect(component.isPlacingOrder).toBeFalse();
    });

    // --- Defect 4: in-flight guard -------------------------------------------------

    it('sets isPlacingOrder while the run is in flight and clears it on success', () => {
      completeInit();

      component.runTest();
      expect(component.isPlacingOrder).toBeTrue();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config').flush({});
      httpMock.expectOne('/api/run-test').flush({ success: true });

      expect(component.isPlacingOrder).toBeFalse();
    });

    it('ignores a second runTest call while one is already in flight', () => {
      completeInit();

      component.runTest();
      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config').flush({});

      component.runTest(); // double click

      // A second run would issue a second POST; matching finds exactly one.
      expect(httpMock.match('/api/run-test').length).toBe(1);
      expect(window.alert).not.toHaveBeenCalled();
    });

    it('disables both Place Order buttons while a run is in flight', () => {
      completeInit();

      const buttons = (): HTMLButtonElement[] =>
        Array.from(fixture.nativeElement.querySelectorAll('button[data-testid="place-order"]'));

      expect(buttons().length).toBe(2);
      expect(buttons().every(b => b.disabled)).toBeFalse();

      component.runTest();
      detect();

      expect(buttons().length).toBe(2);
      expect(buttons().every(b => b.disabled)).toBeTrue();
      expect(buttons().every(b => b.textContent!.includes('Placing Order...'))).toBeTrue();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush(STORED_CONFIG);
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config').flush({});
      httpMock.expectOne('/api/run-test').flush({ success: true });
      detect();

      expect(buttons().every(b => b.disabled)).toBeFalse();
    });
  });

  // --- Neighbouring logic pinned by the refactor -----------------------------------

  describe('syncOrderItemsFromSelection', () => {
    it('hydrates items from the saved config and falls back to product defaults', () => {
      completeInit();

      component.selectedProducts['babys-breath-flower-new-love'] = true;
      component.updateOrderItems();

      const roses = component.orderItems.find(i => i.id === 'roses')!;
      const babys = component.orderItems.find(i => i.id === 'babys-breath-flower-new-love')!;

      expect(roses.quantity).toBe(3);
      expect(roses.deliveryDate).toBe('2026-01-10');
      expect(babys.quantity).toBe(2); // defaultQuantity, no saved order
      expect(babys.deliveryDate).toBe('2026-01-10'); // main delivery date
    });
  });

  describe('applyDateToAll', () => {
    it('copies the main delivery date onto every item', () => {
      completeInit();

      component.deliveryDate = '2026-05-05';
      component.applyDateToAll();

      expect(component.orderItems.every(i => i.deliveryDate === '2026-05-05')).toBeTrue();
    });

    it('does nothing without a main delivery date', () => {
      completeInit();

      component.deliveryDate = '';
      component.applyDateToAll();

      expect(component.orderItems.every(i => i.deliveryDate === '2026-01-10')).toBeTrue();
    });
  });
});
