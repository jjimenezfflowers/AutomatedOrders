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

  });

  // --- Defect 1: saveOrder must not destroy customerInfo / payment -----------------

});
