import { Component, ElementRef, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Circle, CircleCheck, CircleX, Rocket, Save } from 'lucide-angular';

import {
  UI_CARD,
  UiBadgeComponent,
  UiButtonComponent,
  UiCheckboxComponent,
  UiDatePickerComponent,
  UiFieldComponent,
  UiInputComponent,
  UiLabelComponent,
  UiSelectComponent,
} from '../ui';
import {
  STAGING_BASE_URL_FIELD,
  StagingOrderValues,
  quantityError,
  quantityField,
  stagingBaseUrlError,
  stagingOrderErrors,
} from './staging-orders.schema';

interface ProductOption {
  id: string;
  label: string;
  selector: string;
  options: (string | { value: string; label: string; price?: number })[];
  defaultValue: string;
}

interface Product {
  id: string;
  name: string;
  url: string;
  type?: string;
  variantSelector?: string;
  variants?: string[];
  defaultVariant?: string;
  productOptions?: ProductOption[];
  quantitySelector: string;
  defaultQuantity: number;
}

interface OrderItem {
  id: string;
  name: string;
  variant?: string;
  quantity: number;
  productOptions?: { [key: string]: string };
}

interface StagingOrderConfig {
  stagingBaseUrl: string;
  deliveryDate: string;
  orders: {
    productId: string;
    variant?: string;
    quantity: number;
    productOptions?: { [key: string]: string };
  }[];
}

interface RunTestResponse {
  success: boolean;
  output?: string;
}

@Component({
  selector: 'app-staging-orders',
  imports: [
    FormsModule,
    CommonModule,
    LucideAngularModule,
    ...UI_CARD,
    UiBadgeComponent,
    UiButtonComponent,
    UiCheckboxComponent,
    UiFieldComponent,
    UiInputComponent,
    UiLabelComponent,
    UiSelectComponent,
    UiDatePickerComponent,
  ],
  templateUrl: './staging-orders.html',
  styleUrl: './staging-orders.css',
})
export class StagingOrdersComponent implements OnInit {
  readonly icons = {
    staging: Circle,
    save: Save,
    place: Rocket,
    passed: CircleCheck,
    failed: CircleX,
  };
  products: Product[] = [];
  selectedProducts: { [key: string]: boolean } = {};
  orderItems: OrderItem[] = [];
  deliveryDate: string = '';
  stagingBaseUrl: string = '';
  stagingOrderConfig: StagingOrderConfig = { stagingBaseUrl: '', deliveryDate: '', orders: [] };

  isRunning = false;
  testOutput = '';
  testSuccess: boolean | null = null;

  /** Keyed by field name; `quantity-<productId>` for the per-item quantities. */
  errors: Record<string, string | undefined> = {};

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
    this.loadConfig();
  }

  loadProducts() {
    this.http.get<Product[]>('/api/staging-products').subscribe(data => {
      // Deduplicate by id only. Distinct products are allowed to share a name, and
      // dropping one makes it unselectable and erases any saved order for it.
      const uniqueProducts = new Map<string, Product>();
      for (const p of data) {
        if (uniqueProducts.has(p.id)) continue;
        uniqueProducts.set(p.id, p);
      }
      this.products = Array.from(uniqueProducts.values());
      this.syncOrderItemsFromSelection();
    });
  }

  loadConfig() {
    this.http.get<Partial<StagingOrderConfig>>('/api/staging-order-config').subscribe(data => {
      const orders = Array.isArray(data.orders) ? data.orders : [];
      this.stagingOrderConfig = {
        stagingBaseUrl: data.stagingBaseUrl || '',
        deliveryDate: data.deliveryDate || '',
        orders
      };
      this.stagingBaseUrl = this.stagingOrderConfig.stagingBaseUrl;
      this.deliveryDate = this.stagingOrderConfig.deliveryDate;
      this.selectedProducts = {};
      for (const order of orders) {
        this.selectedProducts[order.productId] = true;
      }
      this.syncOrderItemsFromSelection();
    });
  }

  syncOrderItemsFromSelection() {
    const selectedProductIds = new Set<string>();
    const filtered = this.products.filter(product => {
      if (!this.selectedProducts[product.id] || selectedProductIds.has(product.id)) return false;
      selectedProductIds.add(product.id);
      return true;
    });

    this.orderItems = filtered.map(product => {
      const savedOrder = this.stagingOrderConfig.orders.find(o => o.productId === product.id);
      const item: OrderItem = {
        id: product.id,
        name: product.name,
        variant: savedOrder?.variant ?? product.defaultVariant,
        quantity: savedOrder?.quantity ?? product.defaultQuantity
      };
      if (product.type === 'product-options' && product.productOptions) {
        item.productOptions = {};
        product.productOptions.forEach(opt => {
          item.productOptions![opt.id] = savedOrder?.productOptions?.[opt.id] ?? opt.defaultValue;
        });
      }
      return item;
    });

    // Deselecting a product removes its quantity control, so its message has to go
    // too — otherwise a save stays blocked by a field nobody can see or fix.
    const live = new Set(this.orderItems.map(item => quantityField(item.id)));
    for (const field of Object.keys(this.errors)) {
      if (field !== STAGING_BASE_URL_FIELD && !live.has(field)) delete this.errors[field];
    }
  }

  updateOrderItems() {
    this.syncOrderItemsFromSelection();
  }

  /** Re-exported for the template, which keys ui-field's `error` by the same name. */
  quantityField = quantityField;

  /** Blur is the first moment a value is finished, so it is the first moment to judge it. */
  onFieldBlur(field: string) {
    this.validateField(field);
  }

  /*
   * Only re-checks a field that is already showing a message. Validating every
   * keystroke would flag "https:/" as a bad URL while it is still being typed.
   */
  onFieldInput(field: string) {
    if (!this.errors[field]) return;
    this.validateField(field);
  }

  /** One field, against its own piece of the schema. */
  private validateField(field: string) {
    const message = field === STAGING_BASE_URL_FIELD
      ? stagingBaseUrlError(this.stagingBaseUrl ?? '')
      : quantityError(this.orderItems.find(item => quantityField(item.id) === field)?.quantity);

    if (message) {
      this.errors[field] = message;
    } else {
      delete this.errors[field];
    }
  }

  /** The whole payload in one parse, so a blocked save shows every problem at once. */
  private validateAll(): boolean {
    this.errors = stagingOrderErrors(this.formValues());
    return Object.keys(this.errors).length === 0;
  }

  private focusFirstInvalid() {
    const field = this.fields.find(candidate => this.errors[candidate]);
    if (!field) return;

    const controlId = field === STAGING_BASE_URL_FIELD
      ? 'staging-base-url'
      : `staging-quantity-${field.slice('quantity-'.length)}`;

    this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(controlId)}`)?.focus();
  }

  /** Template order, so a blocked save focuses the topmost problem. */
  private get fields(): string[] {
    return [STAGING_BASE_URL_FIELD, ...this.orderItems.map(item => quantityField(item.id))];
  }

  /** What is on screen, in the shape of the payload the schema describes. */
  private formValues(): StagingOrderValues {
    return {
      stagingBaseUrl: this.stagingBaseUrl ?? '',
      orders: this.orderItems.map(item => ({
        productId: item.id,
        // ui-input hands back null for an emptied number box; blank still means "1".
        quantity: item.quantity ?? undefined
      }))
    };
  }

  saveConfig() {
    // A schemeless base URL or a zero quantity does not fail here — it fails minutes
    // later in the checkout run that reads this file back.
    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }

    const uniqueOrders = new Map<string, any>();
    for (const item of this.orderItems) {
      if (uniqueOrders.has(item.id)) continue;
      const order: any = { productId: item.id, quantity: Number(item.quantity) || 1 };
      if (item.variant) order.variant = item.variant;
      if (item.productOptions) order.productOptions = item.productOptions;
      uniqueOrders.set(item.id, order);
    }
    const config: StagingOrderConfig = {
      stagingBaseUrl: this.stagingBaseUrl,
      deliveryDate: this.deliveryDate,
      orders: Array.from(uniqueOrders.values())
    };
    this.http.post('/api/staging-order-config', config).subscribe(() => {
      this.stagingOrderConfig = config;
      alert('Staging order saved!');
    });
  }

  runTest() {
    if (!this.stagingBaseUrl) {
      alert('Please set a Staging Base URL before running the test.');
      this.validateAll();
      return;
    }
    // The run types these values into the storefront, so the same rules gate it.
    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }
    if (this.orderItems.length === 0) {
      alert('Please select at least one product before placing an order');
      return;
    }
    if (!this.deliveryDate) {
      alert('Please select a delivery date');
      return;
    }
    
    this.isRunning = true;
    this.testOutput = '';
    this.testSuccess = null;
    console.log('Starting staging Playwright test...');

    this.http.post<RunTestResponse>('/api/run-test', { staging: true }).subscribe({
      next: response => {
        this.isRunning = false;
        this.testSuccess = response.success;
        this.testOutput = response.output || '';
        
        if (response.success) {
          alert('✅ Staging order placed successfully!');
        } else {
          alert('❌ Staging order failed. Check output below or the Logs tab for details.');
        }
      },
      error: err => {
        this.isRunning = false;
        this.testSuccess = false;
        this.testOutput = err.message || 'Request failed';
        console.error('Staging test error:', err);
        alert('❌ Failed to run staging test. Check the Logs tab for details.');
      }
    });
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  getOptionValue(opt: string | { value: string; label: string; price?: number }): string {
    return typeof opt === 'string' ? opt : opt.value;
  }

  getOptionLabel(opt: string | { value: string; label: string; price?: number }): string {
    return typeof opt === 'string' ? opt : opt.label;
  }

  hasPrice(opt: string | { value: string; label: string; price?: number }): boolean {
    return typeof opt !== 'string' && opt.price !== undefined;
  }
}
