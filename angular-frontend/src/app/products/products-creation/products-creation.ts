import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface NewProduct {
  id: string;
  name: string;
  url: string;
  type?: string;
  variantSelector?: string;
  variants?: string[];
  defaultVariant?: string;
  quantitySelector: string;
  defaultQuantity: number;
}

@Component({
  selector: 'app-products-creation',
  imports: [FormsModule, CommonModule],
  templateUrl: './products-creation.html',
  styleUrl: './products-creation.css',
})
export class ProductsCreation implements OnInit {
  @Input() productToEdit: NewProduct | null = null;
  @Output() created = new EventEmitter<NewProduct>();
  @Output() updated = new EventEmitter<NewProduct>();
  @Output() cancelled = new EventEmitter<void>();

  product: NewProduct = this.emptyProduct();
  variantsText = '';
  errors: Partial<Record<keyof NewProduct, string>> = {};

  get isEditMode(): boolean {
    return this.productToEdit !== null;
  }

  ngOnInit() {
    if (this.productToEdit) {
      this.product = { ...this.productToEdit };
      this.variantsText = this.productToEdit.variants?.join('\n') || '';
    }
  }

  private emptyProduct(): NewProduct {
    return {
      id: '',
      name: '',
      url: '',
      type: '',
      variantSelector: '',
      variants: [],
      defaultVariant: '',
      quantitySelector: '',
      defaultQuantity: 1,
    };
  }

  save() {
    if (!this.validate()) return;

    const variants = this.variantsText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (this.isEditMode) {
      this.updated.emit({ ...this.product, variants });
    } else {
      this.created.emit({ ...this.product, variants });
    }
    this.reset();
  }

  cancel() {
    this.reset();
    this.cancelled.emit();
  }

  private validate(): boolean {
    this.errors = {};
    if (!this.product.id.trim()) this.errors['id'] = 'Product ID is required.';
    if (!this.product.name.trim()) this.errors['name'] = 'Name is required.';
    if (!this.product.url.trim()) this.errors['url'] = 'URL is required.';
    return Object.keys(this.errors).length === 0;
  }

  private reset() {
    this.product = this.emptyProduct();
    this.variantsText = '';
    this.errors = {};
  }
}
