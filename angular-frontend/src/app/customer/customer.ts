import { Component, ElementRef, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { UI_CARD, UiAlertComponent, UiButtonComponent, UiFieldComponent, UiInputComponent } from '../ui';
import {
  CUSTOMER_FIELDS,
  CustomerField,
  CustomerFormValues,
  customerFieldError,
  customerFormErrors,
} from './customer.schema';

type AddressRegion = 'CT' | 'HI' | 'AK' | 'NJ';

/** The fields a preset writes; their messages have to go when it fills them in. */
const ADDRESS_FIELDS: CustomerField[] = ['address', 'city', 'state', 'zipCode'];

interface OrderConfig {
  deliveryDate?: string;
  customerInfo: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  payment: {
    cardNumber: string;
    cvv: string;
    expiry: string;
  };
  orders?: any[];
}

@Component({
  selector: 'app-customer',
  imports: [
    FormsModule,
    CommonModule,
    ...UI_CARD,
    UiAlertComponent,
    UiButtonComponent,
    UiFieldComponent,
    UiInputComponent,
  ],
  templateUrl: './customer.html',
})
export class CustomerComponent implements OnInit {
  customerInfo = {
    email: '',
    phone: '',
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: ''
  };

  payment = {
    cardNumber: '',
    cvv: '',
    expiry: ''
  };

  /** Shipping presets used to exercise different delivery regions. */
  readonly addressPresets: { code: AddressRegion; label: string }[] = [
    { code: 'CT', label: 'Set to CT' },
    { code: 'NJ', label: 'Set to NJ' },
    { code: 'HI', label: 'Set to Hawaii' },
    { code: 'AK', label: 'Set to Alaska' }
  ];

  isSaving = false;

  /** The message showing under each field, keyed the same way the template reads it. */
  errors: Partial<Record<CustomerField, string>> = {};

  private readonly controlIds: Record<CustomerField, string> = {
    email: 'customer-email',
    phone: 'customer-phone',
    firstName: 'customer-first-name',
    lastName: 'customer-last-name',
    address: 'customer-address',
    city: 'customer-city',
    state: 'customer-state',
    zipCode: 'customer-zip',
    cardNumber: 'payment-card',
    expiry: 'payment-expiry',
    cvv: 'payment-cvv',
  };

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadCustomerInfo();
  }

  loadCustomerInfo() {
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe(data => {
      if (data.customerInfo) {
        this.customerInfo = { ...data.customerInfo };
      }
      if (data.payment) {
        this.payment = { ...data.payment };
      }
    });
  }

  /** Blur is the first moment a value is finished, so it is the first moment to judge it. */
  onFieldBlur(field: CustomerField) {
    this.validateField(field);
  }

  /*
   * Only re-checks a field that is already showing a message. Validating every
   * keystroke would flag "buyer@" as a bad address while it is still being typed.
   */
  onFieldInput(field: CustomerField) {
    if (!this.errors[field]) return;
    this.validateField(field);
  }

  saveCustomerInfo() {
    if (this.isSaving) {
      return;
    }

    // Nothing is posted while anything is invalid. These values are typed straight
    // into a real checkout, where a bad expiry only surfaces at the payment step.
    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }

    this.isSaving = true;
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe({
      next: currentConfig => {
        const updatedConfig: Partial<OrderConfig> = {
          ...currentConfig,
          customerInfo: this.customerInfo,
          payment: this.payment
        };

        this.http.post('/api/order-config', updatedConfig).subscribe({
          next: () => {
            this.isSaving = false;
            alert('Customer info saved!');
          },
          error: err => {
            this.isSaving = false;
            alert('Failed to save customer info: ' + (err.message || 'Unknown error'));
          }
        });
      },
      error: err => {
        this.isSaving = false;
        alert('Failed to save customer info: ' + (err.message || 'Unknown error'));
      }
    });
  }

  setAddress(region: AddressRegion) {
    if (region === 'CT') {
      this.customerInfo.address = '124 Ben St';
      this.customerInfo.city = 'Bristol';
      this.customerInfo.state = 'CT';
      this.customerInfo.zipCode = '06830';
    } else if (region === 'NJ') {
      this.customerInfo.address = '179 Wall St';
      this.customerInfo.city = 'West Long Branch';
      this.customerInfo.state = 'NJ';
      this.customerInfo.zipCode = '07764';
    } else if (region === 'HI') {
      this.customerInfo.address = '58 Kapuaimilia Place';
      this.customerInfo.city = 'Maui County';
      this.customerInfo.state = 'Hawaii';
      this.customerInfo.zipCode = '96708';
    } else if (region === 'AK') {
      this.customerInfo.address = '5100 Whispering Spruce Drive';
      this.customerInfo.city = 'Anchorage';
      this.customerInfo.state = 'Alaska';
      this.customerInfo.zipCode = '99516';
    }

    // A preset writes four known-good values, so re-running their rules clears any
    // message left over from the empty form rather than leaving the fields red.
    for (const field of ADDRESS_FIELDS) {
      this.validateField(field);
    }
  }

  /** One field, against its own slice of the schema. */
  private validateField(field: CustomerField) {
    const message = customerFieldError(field, this.currentValue(field));
    if (message) {
      this.errors[field] = message;
    } else {
      delete this.errors[field];
    }
  }

  /** The whole form in one parse, so a blocked save shows every problem at once. */
  private validateAll(): boolean {
    this.errors = customerFormErrors(this.formValues());
    return Object.keys(this.errors).length === 0;
  }

  private focusFirstInvalid() {
    const field = CUSTOMER_FIELDS.find(candidate => this.errors[candidate]);
    if (!field) return;

    this.host.nativeElement.querySelector<HTMLElement>(`#${this.controlIds[field]}`)?.focus();
  }

  /** The two halves of the model flattened into the shape the schema describes. */
  private formValues(): CustomerFormValues {
    return { ...this.customerInfo, ...this.payment };
  }

  private currentValue(field: CustomerField): string {
    return this.formValues()[field] ?? '';
  }
}
