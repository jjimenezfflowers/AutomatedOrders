import { Component, ElementRef, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, CalendarDays, Circle, CircleCheck, CircleX, Dices, Rocket, Save } from 'lucide-angular';
import { Observable, switchMap, tap } from 'rxjs';

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
  origin?: string | string[];
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
  deliveryDate?: string;
  productOptions?: { [key: string]: string };
}

type PlacementMethod = 'storefront' | 'bb';

interface StagingOrderConfig {
  stagingBaseUrl: string;
  deliveryDate: string;
  placementMethod: PlacementMethod;
  orders: {
    productId: string;
    variant?: string;
    quantity: number;
    deliveryDate?: string;
    productOptions?: { [key: string]: string };
  }[];
}

interface RunTestResponse {
  success: boolean;
  output?: string;
}

type ProductSortKey = 'entry' | 'origin' | 'name';

const MIN_LEAD_DAYS = 8;
const MAX_LEAD_DAYS = 12;

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
    random: Dices,
    calendar: CalendarDays,
  };
  products: Product[] = [];
  productSearch = '';
  productSort: ProductSortKey = 'entry';
  placementMethod: PlacementMethod = 'storefront';
  readonly productSortOptions: { value: ProductSortKey; label: string }[] = [
    { value: 'entry', label: 'Entry' },
    { value: 'origin', label: 'Origin' },
    { value: 'name', label: 'Name' },
  ];
  readonly placementMethodOptions: { value: PlacementMethod; label: string }[] = [
    { value: 'storefront', label: 'Storefront checkout' },
    { value: 'bb', label: 'BB Draft Order' },
  ];
  selectedProducts: { [key: string]: boolean } = {};
  orderItems: OrderItem[] = [];
  deliveryDate: string = '';
  stagingBaseUrl: string = '';
  stagingOrderConfig: StagingOrderConfig = {
    stagingBaseUrl: '',
    deliveryDate: '',
    placementMethod: 'storefront',
    orders: [],
  };

  isRunning = false;
  isSavingOrder = false;
  configLoaded = false;
  testOutput = '';
  testSuccess: boolean | null = null;

  /** Keyed by field name; `quantity-<productId>` for the per-item quantities. */
  errors: Record<string, string | undefined> = {};

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly originOptions = ['US', 'CO', 'EC', 'USA/Holex'];
  private readonly collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  private productEntryOrder = new Map<string, number>();

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
      this.productEntryOrder = new Map(this.products.map((product, index) => [product.id, index]));
      this.syncOrderItemsFromSelection();
    });
  }

  loadConfig() {
    this.http.get<Partial<StagingOrderConfig>>('/api/staging-order-config').subscribe({
      next: data => {
        const orders = Array.isArray(data.orders) ? data.orders : [];
        this.stagingOrderConfig = {
          stagingBaseUrl: data.stagingBaseUrl || '',
          deliveryDate: data.deliveryDate || '',
          placementMethod: data.placementMethod === 'bb' ? 'bb' : 'storefront',
          orders,
        };
        this.stagingBaseUrl = this.stagingOrderConfig.stagingBaseUrl;
        this.deliveryDate = this.stagingOrderConfig.deliveryDate;
        this.placementMethod = this.stagingOrderConfig.placementMethod;
        this.selectedProducts = {};
        for (const order of orders) {
          this.selectedProducts[order.productId] = true;
        }
        this.configLoaded = true;
        this.syncOrderItemsFromSelection();
      },
      error: err => {
        console.error('Failed to load staging order config:', err);
        alert('Failed to load the saved staging order: ' + (err.message || 'Unknown error'));
      },
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
        quantity: savedOrder?.quantity ?? product.defaultQuantity,
        deliveryDate: savedOrder?.deliveryDate ?? this.deliveryDate,
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

  get selectedCount(): number {
    return this.products.filter(product => this.selectedProducts[product.id]).length;
  }

  get visibleProducts(): Product[] {
    const term = this.productSearch.trim().toLowerCase();
    if (!term) return this.sortedProducts;

    return this.sortedProducts.filter(product =>
      `${product.name} ${product.id} ${this.formatOrigin(product.origin)}`.toLowerCase().includes(term),
    );
  }

  get sortedProducts(): Product[] {
    return [...this.products].sort((a, b) => this.compareProducts(a, b));
  }

  clearSelection(): void {
    this.selectedProducts = {};
    this.updateOrderItems();
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
    if (!this.configLoaded) {
      alert('The saved staging order has not loaded yet. Please wait a moment and try again.');
      return;
    }

    // A schemeless base URL or a zero quantity does not fail here — it fails minutes
    // later in the checkout run that reads this file back.
    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }

    const config = this.buildConfig();
    this.isSavingOrder = true;
    this.persistConfig(config).subscribe({
      next: () => {
        this.isSavingOrder = false;
        alert('Staging order saved!');
      },
      error: err => {
        this.isSavingOrder = false;
        alert('Failed to save staging order: ' + (err.message || 'Unknown error'));
      },
    });
  }

  private buildConfig(): StagingOrderConfig {
    const uniqueOrders = new Map<string, StagingOrderConfig['orders'][number]>();
    for (const item of this.orderItems) {
      if (uniqueOrders.has(item.id)) continue;
      const order: StagingOrderConfig['orders'][number] = {
        productId: item.id,
        quantity: Number(item.quantity) || 1,
      };
      if (item.variant) order.variant = item.variant;
      if (item.deliveryDate) order.deliveryDate = item.deliveryDate;
      if (item.productOptions) order.productOptions = item.productOptions;
      uniqueOrders.set(item.id, order);
    }

    return {
      stagingBaseUrl: this.stagingBaseUrl,
      deliveryDate: this.deliveryDate,
      placementMethod: this.placementMethod,
      orders: Array.from(uniqueOrders.values()),
    };
  }

  private persistConfig(config = this.buildConfig()): Observable<unknown> {
    return this.http.post('/api/staging-order-config', config).pipe(
      tap(() => {
        this.stagingOrderConfig = config;
      }),
    );
  }

  applyDateToAll() {
    if (!this.deliveryDate) {
      alert('Please select a main delivery date first');
      return;
    }
    this.orderItems.forEach(item => item.deliveryDate = this.deliveryDate);
  }

  randomDateAndApply() {
    const today = new Date();
    const span = MAX_LEAD_DAYS - MIN_LEAD_DAYS + 1;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + Math.floor(Math.random() * span) + MIN_LEAD_DAYS);
    if (targetDate.getDay() === 0) targetDate.setDate(targetDate.getDate() + 1);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    this.deliveryDate = `${year}-${month}-${day}`;
    this.orderItems.forEach(item => item.deliveryDate = this.deliveryDate);
  }

  runTest() {
    if (!this.configLoaded) {
      alert('The saved staging order has not loaded yet. Please wait a moment and try again.');
      return;
    }

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

    const config = this.buildConfig();
    this.persistConfig(config).pipe(
      switchMap(() => this.http.post<RunTestResponse>('/api/run-test', {
        staging: true,
        method: this.placementMethod,
      })),
    ).subscribe({
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

  get placeOrderLabel(): string {
    return this.placementMethod === 'bb' ? 'Place through BB' : 'Place Staging Order';
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  hasOrigin(origin: string | string[] | undefined): boolean {
    return this.normalizeOrigins(origin).length > 0;
  }

  formatOrigin(origin: string | string[] | undefined): string {
    return this.normalizeOrigins(origin).join(' - ');
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

  private normalizeOrigins(origin: string | string[] | undefined): string[] {
    const origins = Array.isArray(origin) ? origin : origin ? [origin] : [];
    return this.originOptions.filter(option => origins.includes(option));
  }

  private compareProducts(a: Product, b: Product): number {
    if (this.productSort === 'name') {
      return this.collator.compare(a.name, b.name) || this.compareByEntry(a, b);
    }
    if (this.productSort === 'origin') {
      const aOrigin = this.normalizeOrigins(a.origin);
      const bOrigin = this.normalizeOrigins(b.origin);
      if (!aOrigin.length && bOrigin.length) return 1;
      if (aOrigin.length && !bOrigin.length) return -1;
      const originOrder = this.originIndex(aOrigin[0]) - this.originIndex(bOrigin[0]);
      return originOrder || this.collator.compare(aOrigin.join(' - '), bOrigin.join(' - '))
        || this.collator.compare(a.name, b.name) || this.compareByEntry(a, b);
    }
    return this.compareByEntry(a, b);
  }

  private compareByEntry(a: Product, b: Product): number {
    return (this.productEntryOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (this.productEntryOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER);
  }

  private originIndex(origin: string | undefined): number {
    const index = origin ? this.originOptions.indexOf(origin) : -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }
}
