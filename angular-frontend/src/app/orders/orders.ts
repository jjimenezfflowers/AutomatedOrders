import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, CalendarDays, Dices, Play } from 'lucide-angular';
import { Observable, map, switchMap, tap } from 'rxjs';

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
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class OrdersComponent implements OnInit {
  readonly icons = { place: Play, random: Dices, calendar: CalendarDays };
  products: Product[] = [];
  productSort: ProductSortKey = 'entry';
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
    if (!this.configLoaded) {
      alert('The saved order has not loaded yet. Please wait a moment and try again.');
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

    if (!this.deliveryDate) {
      alert('Please select a delivery date');
      return;
    }

    console.log('Starting Playwright test...');

    this.isPlacingOrder = true;
    // The Playwright run reads order-config.json from disk, so the on-screen state has to be
    // persisted first; only run the test once the save has actually succeeded.
    this.persistOrderConfig().pipe(
      switchMap(() => this.http.post<RunTestResponse>('/api/run-test', {}))
    ).subscribe({
      next: (response) => {
        this.isPlacingOrder = false;

        if (response.success) {
          alert('✅ Order placed successfully!\n\nThe test completed without errors.');
          return;
        }

        const output = response.output || 'No output available';
        alert(`❌ Order placement failed:\n\n${output.substring(0, 500)}${output.length > 500 ? '...' : ''}\n\nCheck the Logs tab for full details.`);
      },
      error: (err) => {
        this.isPlacingOrder = false;
        console.error('Test execution error:', err);
        alert(`❌ Failed to run test:\n\n${err.message || 'Unknown error'}\n\nCheck the Logs tab for details.`);
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
    // Random number between 7 and 10 (inclusive)
    const daysToAdd = Math.floor(Math.random() * 4) + 7; // 7, 8, 9, or 10
    
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
