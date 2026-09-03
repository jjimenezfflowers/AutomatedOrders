import { Component, ElementRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, CalendarDays, Dices, Play } from 'lucide-angular';
import { Observable, map, switchMap, tap } from 'rxjs';

import { OrderResultComponent, PlacedOrder } from './order-result';

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

/*
 * The storefront will not take a delivery date inside its lead time. Measured on
 * three different products on 2026-09-02, the earliest it offered was 8 days out,
 * and Sundays are blocked on top of that.
 *
 * The old range started at 7, so one pick in four produced a date the calendar
 * rejects — the run then fails at the date step rather than at the button that
 * chose it.
 */
const MIN_LEAD_DAYS = 8;
const MAX_LEAD_DAYS = 12;

import {
  deliveryDateError,
  deliveryDateField,
  orderFormErrors,
  quantityError,
  quantityField,
} from './orders.schema';

interface OrderItem {
  id: string;
  name: string;
  variant?: string;
  quantity: number;
  deliveryDate?: string;
  productOptions?: { [key: string]: string };
}

interface OrderConfig {
  deliveryDate: string;
  customerInfo?: Record<string, string>;
  payment?: Record<string, string>;
  orders: OrderConfigEntry[];
}

interface OrderConfigEntry {
  productId: string;
  variant?: string;
  quantity: number;
  deliveryDate?: string;
  productOptions?: { [key: string]: string };
}

interface RunTestResponse {
  success: boolean;
  output?: string;
  /** What the run placed, read back from the store. Absent on older servers. */
  order?: PlacedOrder | null;
}

type ProductSortKey = 'entry' | 'origin' | 'name';

@Component({
  selector: 'app-orders',
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
    OrderResultComponent,
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class OrdersComponent implements OnInit {
  readonly icons = { place: Play, random: Dices, calendar: CalendarDays };

  /*
   * The result of the last run. A run used to report itself through a native
   * alert() that said only "the test completed without errors" and then vanished;
   * it could not say what was placed, because nothing was captured.
   */
  placedOrder: PlacedOrder | null = null;
  runError: string | null = null;
  products: Product[] = [];
  productSort: ProductSortKey = 'entry';
  /** Filters the picker; 24 products in a checkbox grid is more than anyone scans. */
  productSearch = '';

  /** Messages keyed by field; empty means the order can be saved. */
  errors: Record<string, string | undefined> = {};

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly productSortOptions: { value: ProductSortKey; label: string }[] = [
    { value: 'entry', label: 'Entry' },
    { value: 'origin', label: 'Origin' },
    { value: 'name', label: 'Name' }
  ];
  selectedProducts: { [key: string]: boolean } = {};
  orderItems: OrderItem[] = [];
  deliveryDate: string = '';
  orderConfig: OrderConfig = {
    deliveryDate: '',
    orders: []
  };
  isSavingOrder = false;
  isPlacingOrder = false;
  configLoaded = false;
  private readonly originOptions = ['US', 'CO', 'EC'];
  private readonly collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  private productEntryOrder = new Map<string, number>();

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
    this.loadOrderConfig();
  }

  loadProducts() {
    this.http.get<Product[]>('/api/products').subscribe(data => {
      // Deduplicate by ID only. Distinct products are allowed to share a name, and dropping
      // one of them would make it unselectable and erase any saved order for it on the next save.
      const uniqueProducts = new Map<string, Product>();

      for (const p of data) {
        if (uniqueProducts.has(p.id)) {
          continue; // exact duplicate by ID
        }

        uniqueProducts.set(p.id, p);
      }

      this.products = Array.from(uniqueProducts.values());
      this.productEntryOrder = new Map(this.products.map((product, index) => [product.id, index]));
      this.syncOrderItemsFromSelection();
    });
  }

  /** How many of the available products are ticked, for the picker's header. */
  get selectedCount(): number {
    return this.products.filter((product) => this.selectedProducts[product.id]).length;
  }

  /** Sorted, then narrowed by the search box. */
  get visibleProducts(): Product[] {
    const term = this.productSearch.trim().toLowerCase();
    if (!term) return this.sortedProducts;

    return this.sortedProducts.filter((product) =>
      `${product.name} ${product.id} ${this.formatOrigin(product.origin)}`
        .toLowerCase()
        .includes(term),
    );
  }

  /* Validate when a field is left, not on every keystroke. */
  onFieldBlur(field: string): void {
    this.validateField(field);
  }

  /*
   * Only re-checks a field already showing a message, so a half-typed date is not
   * flagged, but a corrected one clears as soon as it is right.
   */
  onFieldInput(field: string): void {
    if (this.errors[field]) this.validateField(field);
  }

  quantityFieldKey = quantityField;
  deliveryDateFieldKey = deliveryDateField;

  private validateField(field: string): void {
    if (field === 'deliveryDate') {
      this.errors[field] = deliveryDateError(this.deliveryDate) ?? undefined;
      return;
    }

    const item = this.orderItems.find(
      candidate =>
        quantityField(candidate.id) === field || deliveryDateField(candidate.id) === field,
    );
    if (!item) return;

    this.errors[field] =
      (field.startsWith('quantity-')
        // Not Number(): a cleared box reads back as null, and Number(null) is 0,
        // which is indistinguishable from a deliberately typed 0. Blank saves as 1.
        ? quantityError(item.quantity)
        : item.deliveryDate
          ? deliveryDateError(item.deliveryDate)
          : null) ?? undefined;
  }

  private validateAll(): boolean {
    this.errors = orderFormErrors({
      deliveryDate: this.deliveryDate,
      orders: this.orderItems.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        deliveryDate: item.deliveryDate,
      })),
    });
    return Object.keys(this.errors).length === 0;
  }

  private focusFirstInvalid(): void {
    const field = Object.keys(this.errors).find(key => this.errors[key]);
    if (!field) return;

    const controlId =
      field === 'deliveryDate'
        ? 'order-delivery-date'
        : field.startsWith('quantity-')
          ? `quantity-${field.slice('quantity-'.length)}`
          : `delivery-date-${field.slice('deliveryDate-'.length)}`;

    this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(controlId)}`)?.focus();
  }

  clearSelection(): void {
    this.selectedProducts = {};
    this.updateOrderItems();
  }

  get sortedProducts(): Product[] {
    return [...this.products].sort((a, b) => this.compareProducts(a, b));
  }

  loadOrderConfig() {
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe({
      next: data => {
        const orders = Array.isArray(data.orders) ? data.orders : [];

        this.orderConfig = {
          deliveryDate: data.deliveryDate || '',
          customerInfo: data.customerInfo || {},
          payment: data.payment || {},
          orders
        };

        this.deliveryDate = this.orderConfig.deliveryDate;
        this.selectedProducts = {};
        for (const order of orders) {
          this.selectedProducts[order.productId] = true;
        }

        this.configLoaded = true;
        this.syncOrderItemsFromSelection();
      },
      error: err => {
        // Leave configLoaded false so saving cannot overwrite a config we never read.
        console.error('Failed to load order config:', err);
        alert('Failed to load the saved order: ' + (err.message || 'Unknown error'));
      }
    });
  }

  syncOrderItemsFromSelection() {
    const selectedProductIds = new Set<string>();
    const filtered = this.products.filter(product => {
      if (!this.selectedProducts[product.id]) {
        return false;
      }

      if (selectedProductIds.has(product.id)) {
        return false; // Sanity dedupe again by id
      }

      selectedProductIds.add(product.id);
      return true;
    });

    this.orderItems = filtered.map(product => {
      const savedOrder = this.orderConfig.orders.find(order => order.productId === product.id);

      const item: OrderItem = {
        id: product.id,
        name: product.name,
        variant: savedOrder?.variant ?? product.defaultVariant,
        quantity: savedOrder?.quantity ?? product.defaultQuantity,
        deliveryDate: savedOrder?.deliveryDate ?? this.deliveryDate
      };

      if (product.type === 'product-options' && product.productOptions) {
        item.productOptions = {};
        product.productOptions.forEach(opt => {
          item.productOptions![opt.id] = savedOrder?.productOptions?.[opt.id] ?? opt.defaultValue;
        });
      }

      return item;
    });
  }

  updateOrderItems() {
    this.syncOrderItemsFromSelection();
  }

  saveOrder() {
    // The "not loaded yet" guard runs first: it explains a different problem, and
    // validating a form that has not been populated would report every field blank.
    if (!this.configLoaded) {
      alert('The saved order has not loaded yet. Please wait a moment and try again.');
      return;
    }

    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }

    this.isSavingOrder = true;
    this.persistOrderConfig().subscribe({
      next: () => {
        this.isSavingOrder = false;
        alert('Order saved successfully!');
      },
      error: (err) => {
        this.isSavingOrder = false;
        alert('Failed to save order: ' + (err.message || 'Unknown error'));
      }
    });
  }

  private buildOrders(): OrderConfigEntry[] {
    const uniqueOrders = new Map<string, OrderConfigEntry>();
    for (const item of this.orderItems) {
      if (uniqueOrders.has(item.id)) {
        continue;
      }

      const order: OrderConfigEntry = {
        productId: item.id,
        quantity: Number(item.quantity) || 1
      };
      if (item.variant) {
        order.variant = item.variant;
      }
      if (item.deliveryDate) {
        order.deliveryDate = item.deliveryDate;
      }
      if (item.productOptions) {
        order.productOptions = item.productOptions;
      }

      uniqueOrders.set(item.id, order);
    }

    return Array.from(uniqueOrders.values());
  }

  // The server rewrites order-config.json wholesale, so re-read it and merge on top of the
  // current contents. Otherwise a stale cached config would drop customerInfo/payment.
  private persistOrderConfig(): Observable<OrderConfig> {
    const orders = this.buildOrders();

    return this.http.get<Partial<OrderConfig>>('/api/order-config').pipe(
      switchMap(currentConfig => {
        const orderConfig: OrderConfig = {
          ...currentConfig,
          deliveryDate: this.deliveryDate,
          orders
        };

        return this.http.post('/api/order-config', orderConfig).pipe(map(() => orderConfig));
      }),
      tap(orderConfig => {
        this.orderConfig = orderConfig;
      })
    );
  }

  applyDateToAll() {
    if (!this.deliveryDate) {
      alert('Please select a main delivery date first');
      return;
    }
    this.orderItems.forEach(item => {
      item.deliveryDate = this.deliveryDate;
    });
  }

  runTest() {
    if (this.isPlacingOrder) {
      return;
    }

    if (!this.configLoaded) {
      alert('The saved order has not loaded yet. Please wait a moment and try again.');
      return;
    }

    if (this.orderItems.length === 0) {
      alert('Please select at least one product before placing an order');
      return;
    }

    if (!this.validateAll()) {
      this.focusFirstInvalid();
      return;
    }

    console.log('Starting Playwright test...');

    this.isPlacingOrder = true;
    // Clear the previous run's result, so a failure never leaves the last
    // success on screen looking like it belongs to this run.
    this.placedOrder = null;
    this.runError = null;
    // The Playwright run reads order-config.json from disk, so the on-screen state has to be
    // persisted first; only run the test once the save has actually succeeded.
    this.persistOrderConfig().pipe(
      switchMap(() => this.http.post<RunTestResponse>('/api/run-test', {}))
    ).subscribe({
      next: (response) => {
        this.isPlacingOrder = false;

        if (response.success) {
          this.placedOrder = response.order ?? null;
          // A run that succeeded but reported no order still needs saying: the
          // order exists, and silence would read as nothing having happened.
          this.runError = response.order
            ? null
            : 'The run completed, but the store returned no order for it. Check History and the Logs page.';
          return;
        }

        this.runError = response.output || 'No output available';
      },
      error: (err) => {
        this.isPlacingOrder = false;
        console.error('Test execution error:', err);
        this.runError = err.message || 'Unknown error';
      }
    });
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

  isStringOption(opt: string | { value: string; label: string; price?: number }): opt is string {
    return typeof opt === 'string';
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
      return this.compareByName(a, b) || this.compareByEntry(a, b);
    }

    if (this.productSort === 'origin') {
      return this.compareByOrigin(a, b) || this.compareByName(a, b) || this.compareByEntry(a, b);
    }

    return this.compareByEntry(a, b);
  }

  private compareByName(a: Product, b: Product): number {
    return this.compareText(a.name, b.name);
  }

  private compareByOrigin(a: Product, b: Product): number {
    const aOrigins = this.normalizeOrigins(a.origin);
    const bOrigins = this.normalizeOrigins(b.origin);

    if (!aOrigins.length && bOrigins.length) return 1;
    if (aOrigins.length && !bOrigins.length) return -1;

    const firstOriginComparison = this.originIndex(aOrigins[0]) - this.originIndex(bOrigins[0]);
    if (firstOriginComparison !== 0) return firstOriginComparison;

    return this.compareText(aOrigins.join(' - '), bOrigins.join(' - '));
  }

  private compareByEntry(a: Product, b: Product): number {
    return this.entryIndex(a) - this.entryIndex(b);
  }

  private compareText(a: string | undefined, b: string | undefined): number {
    return this.collator.compare(a || '', b || '');
  }

  private entryIndex(product: Product): number {
    return this.productEntryOrder.get(product.id) ?? Number.MAX_SAFE_INTEGER;
  }

  private originIndex(origin: string | undefined): number {
    const index = origin ? this.originOptions.indexOf(origin) : -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }

  randomDateAndApply() {
    this.generateRandomDate();
    this.orderItems.forEach(item => {
      item.deliveryDate = this.deliveryDate;
    });
  }

  generateRandomDate() {
    const today = new Date();
    const span = MAX_LEAD_DAYS - MIN_LEAD_DAYS + 1;
    const daysToAdd = Math.floor(Math.random() * span) + MIN_LEAD_DAYS;
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysToAdd);
    
    // Check if it's Sunday (0 = Sunday)
    if (targetDate.getDay() === 0) {
      // Skip Sunday, move to Monday
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    // Format as YYYY-MM-DD for date input
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    
    this.deliveryDate = `${year}-${month}-${day}`;
  }
}
