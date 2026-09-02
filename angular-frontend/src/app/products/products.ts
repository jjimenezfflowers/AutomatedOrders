import { Component, OnInit, Input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ChevronsUpDown, Plus, SquarePen, Trash2 } from 'lucide-angular';

import { ProductsCreation, NewProduct } from './products-creation/products-creation';
import { UI_CARD, UiBadgeComponent, UiButtonComponent } from '../ui';

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
  variantsText?: string; // Helper for textarea binding
}

@Component({
  selector: 'app-products',
  imports: [
    FormsModule,
    CommonModule,
    ProductsCreation,
    LucideAngularModule,
    UiButtonComponent,
    UiBadgeComponent,
    ...UI_CARD,
  ],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class ProductsComponent implements OnInit {
  @Input() apiEndpoint: string = '/api/products';

  products: Product[] = [];
  showCreation = false;
  editingProduct: NewProduct | null = null;
  editingIndex: number = -1;

  readonly icons = { add: Plus, sort: ChevronsUpDown, edit: SquarePen, delete: Trash2 };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    this.http.get<Product[]>(this.apiEndpoint).subscribe(data => {
      // Deduplicate products by ID so we don't show a product twice if the JSON has a duplicate entry.
      const uniqueProducts = new Map<string, Product>();
      for (const p of data) {
        uniqueProducts.set(p.id, p);
      }

      this.products = Array.from(uniqueProducts.values()).map(p => ({
        ...p,
        variantsText: p.variants?.join('\n') || ''
      }));
    });
  }

  addProduct() {
    this.editingProduct = null;
    this.editingIndex = -1;
    this.showCreation = true;
  }

  editProductAt(index: number) {
    const p = this.products[index];
    this.editingProduct = { ...p };
    this.editingIndex = index;
    this.showCreation = true;
  }

  onProductCreated(newProduct: NewProduct) {
    this.products.push({ ...newProduct, variantsText: newProduct.variants?.join('\n') || '' });
    this.showCreation = false;
    this.saveProducts();
  }

  onProductUpdated(updatedProduct: NewProduct) {
    if (this.editingIndex >= 0) {
      this.products[this.editingIndex] = { ...this.products[this.editingIndex], ...updatedProduct, variantsText: updatedProduct.variants?.join('\n') || '' };
    }
    this.editingProduct = null;
    this.editingIndex = -1;
    this.showCreation = false;
    this.saveProducts();
  }

  onCreationCancelled() {
    this.editingProduct = null;
    this.editingIndex = -1;
    this.showCreation = false;
  }

  deleteProduct(index: number) {
    this.products.splice(index, 1);
    this.saveProducts();
  }

  updateVariants(product: Product) {
    const text = product.variantsText || '';
    product.variants = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  hasOrigin(origin: string | string[] | undefined): boolean {
    return this.normalizeOrigins(origin).length > 0;
  }

  formatOrigin(origin: string | string[] | undefined): string {
    return this.normalizeOrigins(origin).join(' - ');
  }

  saveProducts() {
    const productsToSave = this.products.map(p => {
      const { variantsText, ...product } = p;
      return product;
    });
    
    this.http.post(this.apiEndpoint, productsToSave).subscribe({
      next: () => alert('Products saved!'),
      error: (err) => alert('Failed to save products: ' + (err?.message || err?.status || 'Unknown error'))
    });
  }

  private normalizeOrigins(origin: string | string[] | undefined): string[] {
    const originOptions = ['US', 'CO', 'EC'];
    const origins = Array.isArray(origin) ? origin : origin ? [origin] : [];
    return originOptions.filter(option => origins.includes(option));
  }
}
