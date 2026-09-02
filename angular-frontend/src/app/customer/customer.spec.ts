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

  describe('design-system migration', () => {
    function html(): string {
      return (fixture.nativeElement as HTMLElement).innerHTML;
    }

    function field(testId: string): HTMLInputElement {
      return fixture.nativeElement.querySelector(`input[data-testid="${testId}"]`);
    }

    it('renders every customer and payment field through ui-input', () => {
      const ids = [
        'customer-email', 'customer-phone', 'customer-first-name', 'customer-last-name',
        'customer-address', 'customer-city', 'customer-state', 'customer-zip',
        'payment-card', 'payment-expiry', 'payment-cvv',
      ];

      for (const id of ids) {
        expect(field(id)).withContext(id).not.toBeNull();
      }
    });

    it('drops the hardcoded surfaces that would stay light in dark mode', () => {
      expect(html()).not.toContain('bg-white');
      expect(html()).not.toContain('border-gray-300');
      expect(html()).not.toContain('bg-green-600');
    });

    it('still round-trips through [(ngModel)] after the swap', async () => {
      const input = field('customer-email');
      input.value = 'buyer@example.test';
      input.dispatchEvent(new Event('input'));
      detect();
      await fixture.whenStable();

      expect(component.customerInfo.email).toBe('buyer@example.test');
    });

    it('pushes loaded values down into the inputs', async () => {
      component.customerInfo.city = 'Bristol';
      detect();
      await fixture.whenStable();
      detect();

      expect(field('customer-city').value).toBe('Bristol');
    });

    it('keeps every address preset reachable', () => {
      for (const preset of component.addressPresets) {
        const button = fixture.nativeElement.querySelector(
          `button[data-testid="address-preset-${preset.code}"]`,
        );
        expect(button).withContext(preset.code).not.toBeNull();
      }
    });

    it('a preset still fills the address', () => {
      const button: HTMLButtonElement = fixture.nativeElement.querySelector(
        'button[data-testid="address-preset-CT"]',
      );
      button.click();
      detect();

      expect(component.customerInfo.city).toBe('Bristol');
      expect(component.customerInfo.state).toBe('CT');
    });

    it('disables the save button while a save is in flight, so it cannot double-post', () => {
      const button = (): HTMLButtonElement =>
        fixture.nativeElement.querySelector('button[data-testid="save-customer"]');

      expect(button().disabled).toBeFalse();

      component.saveCustomerInfo();
      detect();
      expect(button().disabled).toBeTrue();

      httpMock.expectOne('/api/order-config').flush({});
      httpMock.expectOne({ method: 'POST', url: '/api/order-config' }).flush({});
      detect();

      expect(button().disabled).toBeFalse();
    });

    it('clears the in-flight flag when the save fails', () => {
      component.saveCustomerInfo();
      httpMock.expectOne('/api/order-config').flush('boom', { status: 500, statusText: 'Server Error' });
      detect();

      expect(component.isSaving).toBeFalse();
    });
  });
});
