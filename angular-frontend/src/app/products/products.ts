import { Component, OnInit, Input } from '@angular/core';
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
  variantsText?: string; // Helper for textarea binding
}

@Component({
  selector: 'app-products',
  imports: [FormsModule, CommonModule],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class ProductsComponent implements OnInit {
  @Input() apiEndpoint: string = '/api/products';

  products: Product[] = [];

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
    this.products.push({
      id: '',
      name: '',
      url: '',
      quantitySelector: '',
      defaultQuantity: 1
    });
  }

  deleteProduct(index: number) {
    this.products.splice(index, 1);
  }

  updateVariants(product: Product) {
    const text = product.variantsText || '';
    product.variants = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  saveProducts() {
    const productsToSave = this.products.map(p => {
      const { variantsText, ...product } = p;
      return product;
    });
    
    this.http.post(this.apiEndpoint, productsToSave).subscribe(() => {
      alert('Products saved!');
    });
  }
}
