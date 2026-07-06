import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
  imports: [FormsModule, CommonModule],
  templateUrl: './staging-orders.html',
  styleUrl: './staging-orders.css',
})
export class StagingOrdersComponent implements OnInit {
  products: Product[] = [];
  selectedProducts: { [key: string]: boolean } = {};
  orderItems: OrderItem[] = [];
  deliveryDate: string = '';
  stagingBaseUrl: string = '';
  stagingOrderConfig: StagingOrderConfig = { stagingBaseUrl: '', deliveryDate: '', orders: [] };

  isRunning = false;
  testOutput = '';
  testSuccess: boolean | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
    this.loadConfig();
  }

  loadProducts() {
    this.http.get<Product[]>('/api/staging-products').subscribe(data => {
      const uniqueProducts = new Map<string, Product>();
      const names = new Set<string>();
      for (const p of data) {
        if (uniqueProducts.has(p.id) || names.has(p.name)) continue;
        names.add(p.name);
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
  }

  updateOrderItems() {
    this.syncOrderItemsFromSelection();
  }

  saveConfig() {
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
      return;
    }
    this.isRunning = true;
    this.testOutput = '';
    this.testSuccess = null;
    this.http.post<RunTestResponse>('/api/run-test', { staging: true }).subscribe({
      next: response => {
        this.isRunning = false;
        this.testSuccess = response.success;
        this.testOutput = response.output || '';
      },
      error: err => {
        this.isRunning = false;
        this.testSuccess = false;
        this.testOutput = err.message || 'Request failed';
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
