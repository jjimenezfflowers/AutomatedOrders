import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CustomerComponent } from './customer';

describe('CustomerComponent', () => {
  let component: CustomerComponent;
  let fixture: ComponentFixture<CustomerComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    spyOn(window, 'alert');

    fixture = TestBed.createComponent(CustomerComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    detect();
    httpMock.expectOne('/api/order-config').flush({});
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('merges onto the current config so the saved orders are preserved', () => {
    component.customerInfo.email = 'buyer@example.test';
    component.saveCustomerInfo();

    httpMock
      .expectOne(r => r.method === 'GET' && r.url === '/api/order-config')
      .flush({ deliveryDate: '2026-01-10', orders: [{ productId: 'roses', quantity: 1 }] });

    const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');
    expect(post.request.body.orders).toEqual([{ productId: 'roses', quantity: 1 }]);
    expect(post.request.body.customerInfo.email).toBe('buyer@example.test');
    post.flush({});
  });
});
