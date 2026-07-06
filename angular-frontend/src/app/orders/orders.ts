import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface ProductOption {
  id: string;
  label: string;
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
  deliveryDate?: string;
  productOptions?: { [key: string]: string };
}

interface OrderConfig {
  deliveryDate: string;
  customerInfo?: Record<string, string>;
  payment?: Record<string, string>;
  orders: {
    productId: string;
    variant?: string;
    quantity: number;
    deliveryDate?: string;
  }[];
}

interface RunTestResponse {
  success: boolean;
  output?: string;
}

@Component({
  selector: 'app-orders',
  imports: [FormsModule, CommonModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class OrdersComponent implements OnInit {
  products: Product[] = [];
  selectedProducts: { [key: string]: boolean } = {};
  orderItems: OrderItem[] = [];
  deliveryDate: string = '';
  orderConfig: OrderConfig = {
    deliveryDate: '',
    orders: []
  };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
    this.loadOrderConfig();
  }

  loadProducts() {
    this.http.get<Product[]>('/api/products').subscribe(data => {
      // Deduplicate products by ID first. If you have two products with the same name
      // (same item being imported twice) we also keep one copy by name.
      const uniqueProducts = new Map<string, Product>();
      const names = new Set<string>();

      for (const p of data) {
        if (uniqueProducts.has(p.id)) {
          continue; // exact duplicate by ID
        }

        if (names.has(p.name)) {
          console.warn(`Skipping duplicate product name: ${p.name} (id=${p.id})`);
          continue; // avoid “2 Baby's Breath” if duplicates exist by name
        }

        names.add(p.name);
        uniqueProducts.set(p.id, p);
      }

      this.products = Array.from(uniqueProducts.values());
      this.syncOrderItemsFromSelection();
    });
  }

  loadOrderConfig() {
    this.http.get<Partial<OrderConfig>>('/api/order-config').subscribe(data => {
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

      this.syncOrderItemsFromSelection();
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
          item.productOptions![opt.id] = opt.defaultValue;
        });
      }

      return item;
    });
  }

  updateOrderItems() {
    this.syncOrderItemsFromSelection();
  }

  saveOrder() {
    const uniqueOrders = new Map<string, any>();
    for (const item of this.orderItems) {
      if (uniqueOrders.has(item.id)) {
        continue;
      }

      const order: any = {
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

    const orderConfig: OrderConfig = {
      ...this.orderConfig,
      deliveryDate: this.deliveryDate,
      orders: Array.from(uniqueOrders.values())
    };

    this.http.post('/api/order-config', orderConfig).subscribe(() => {
      this.orderConfig = orderConfig;
      alert('Order saved!');
    });
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
    this.http.post<RunTestResponse>('/api/run-test', {}).subscribe(response => {
      if (response.success) {
        alert('Test completed successfully!');
        return;
      }

      alert(`Test failed:\n\n${response.output || 'No output available'}`);
    });
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
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
