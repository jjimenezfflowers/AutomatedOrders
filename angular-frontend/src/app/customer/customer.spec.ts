import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CustomerComponent } from './customer';

/** A form the checkout would accept, used as the starting point for the failure cases. */
const VALID_CUSTOMER = {
  email: 'buyer@example.test',
  phone: '(555) 555-5555',
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: '124 Ben St',
  city: 'Bristol',
  state: 'CT',
  zipCode: '06830'
};

const VALID_PAYMENT = {
  cardNumber: '4242424242424242',
  cvv: '123',
  expiry: '1226'
};

describe('CustomerComponent', () => {
  let component: CustomerComponent;
  let fixture: ComponentFixture<CustomerComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  /** ngModel writes into its control on a microtask, so the DOM lags one turn behind. */
  async function settle() {
    detect();
    await fixture.whenStable();
    detect();
  }

  function input(testId: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(`input[data-testid="${testId}"]`) as HTMLInputElement;
  }

  /** ui-field renders its message as `<controlId>-error`, which is also what it labels. */
  function message(controlId: string): string | null {
    const alert = fixture.nativeElement.querySelector(`#${controlId}-error[role="alert"]`);
    return alert ? alert.textContent!.trim() : null;
  }

  /** Drives a control the way a user would; `input` bubbles, as it does in a browser. */
  async function type(element: HTMLInputElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  /** Leaving a field: `focusout` is the bubbling half of blur, which is what the host sees. */
  function leave(element: HTMLInputElement) {
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    detect();
  }

  function fillValidForm() {
    component.customerInfo = { ...VALID_CUSTOMER };
    component.payment = { ...VALID_PAYMENT };
    detect();
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
    fillValidForm();
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

      fillValidForm();
      component.saveCustomerInfo();
      detect();
      expect(button().disabled).toBeTrue();

      httpMock.expectOne('/api/order-config').flush({});
      httpMock.expectOne({ method: 'POST', url: '/api/order-config' }).flush({});
      detect();

      expect(button().disabled).toBeFalse();
    });

    it('clears the in-flight flag when the save fails', () => {
      fillValidForm();
      component.saveCustomerInfo();
      httpMock.expectOne('/api/order-config').flush('boom', { status: 500, statusText: 'Server Error' });
      detect();

      expect(component.isSaving).toBeFalse();
    });
  });

  describe('validation', () => {
    it('posts a valid form untouched', () => {
      fillValidForm();
      component.saveCustomerInfo();

      httpMock.expectOne(r => r.method === 'GET' && r.url === '/api/order-config').flush({});
      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/order-config');

      expect(post.request.body.customerInfo).toEqual(VALID_CUSTOMER);
      expect(post.request.body.payment).toEqual(VALID_PAYMENT);
      post.flush({});
    });

    it('makes no request at all when a single field is invalid', () => {
      fillValidForm();
      component.customerInfo.zipCode = '100';
      detect();

      component.saveCustomerInfo();

      httpMock.expectNone(r => r.url === '/api/order-config');
      expect(component.isSaving).toBeFalse();
    });

    it('renders the message in the field and marks the control invalid', () => {
      fillValidForm();
      component.customerInfo.email = 'buyer.example.test';
      detect();

      component.saveCustomerInfo();
      detect();

      expect(message('customer-email')).toBe('Enter a valid email address.');
      expect(input('customer-email').getAttribute('aria-invalid')).toBe('true');
    });

    it('moves focus to the first invalid field on a blocked save', () => {
      fillValidForm();
      component.customerInfo.phone = '555';
      component.payment.cvv = '';
      detect();

      component.saveCustomerInfo();
      detect();

      expect(document.activeElement).toBe(input('customer-phone'));
    });

    it('reports every empty field at once on an untouched form', () => {
      component.saveCustomerInfo();
      detect();

      expect(message('customer-email')).toBe('Email is required.');
      expect(message('customer-first-name')).toBe('First name is required.');
      expect(message('customer-city')).toBe('City is required.');
      expect(message('payment-cvv')).toBe('CVV is required.');
      httpMock.expectNone(r => r.url === '/api/order-config');
    });

    it('says nothing while the email is being typed, then speaks on blur', async () => {
      const email = input('customer-email');

      await type(email, 'buyer');
      expect(message('customer-email')).toBeNull();

      await type(email, 'buyer@');
      expect(message('customer-email')).toBeNull();

      leave(email);
      expect(message('customer-email')).toBe('Enter a valid email address.');
    });

    it('clears a field message as soon as the value is fixed', async () => {
      const email = input('customer-email');

      await type(email, 'buyer');
      leave(email);
      expect(message('customer-email')).toBe('Enter a valid email address.');

      await type(email, 'buyer@example.test');

      expect(message('customer-email')).toBeNull();
      expect(input('customer-email').getAttribute('aria-invalid')).toBeNull();
    });

    it('an address preset clears the messages on the fields it fills', () => {
      component.saveCustomerInfo();
      detect();
      expect(message('customer-city')).toBe('City is required.');

      (fixture.nativeElement.querySelector(
        'button[data-testid="address-preset-CT"]',
      ) as HTMLButtonElement).click();
      detect();

      for (const controlId of ['customer-address', 'customer-city', 'customer-state', 'customer-zip']) {
        expect(message(controlId)).withContext(controlId).toBeNull();
      }
      // Only the fields the preset writes: the rest of the form is still unanswered.
      expect(message('customer-email')).toBe('Email is required.');
    });

    describe('the rules that matter at the payment step', () => {
      const cases: { testId: string; value: string; expected: string }[] = [
        {
          testId: 'payment-card',
          value: '4242424242424241',
          expected: 'That card number fails its checksum — check for a typo.'
        },
        { testId: 'payment-expiry', value: '1326', expected: 'Month must be between 01 and 12.' },
        { testId: 'payment-cvv', value: '12', expected: 'CVV is 3 or 4 digits.' },
        { testId: 'customer-zip', value: '100', expected: 'Enter a 5-digit ZIP code.' },
        { testId: 'customer-email', value: 'buyer.example.test', expected: 'Enter a valid email address.' },
        { testId: 'customer-phone', value: '555-5555', expected: 'Enter a 10-digit phone number.' }
      ];

      for (const { testId, value, expected } of cases) {
        it(`rejects "${value}" in ${testId}`, async () => {
          const element = input(testId);
          await type(element, value);
          leave(element);

          expect(message(testId)).toBe(expected);
        });
      }

      it('accepts a Luhn-valid card, an MMYY expiry and a ZIP+4', async () => {
        for (const [testId, value] of [
          ['payment-card', '4242 4242 4242 4242'],
          ['payment-expiry', '1226'],
          ['customer-zip', '06830-1234']
        ] as const) {
          const element = input(testId);
          await type(element, value);
          leave(element);

          expect(message(testId)).withContext(testId).toBeNull();
        }
      });
    });
  });
});
