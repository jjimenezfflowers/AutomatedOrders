import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Check } from 'lucide-angular';

import {
  UI_CARD,
  UiAlertComponent,
  UiButtonComponent,
  UiCheckboxComponent,
  UiFieldComponent,
  UiInputComponent,
  UiSelectComponent,
  UiTextareaComponent,
} from '../../ui';

interface ProductOption {
  id: string;
  label: string;
  selector: string;
  options: (string | { value: string; label: string; price?: number })[];
  defaultValue: string;
}

export interface NewProduct {
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

@Component({
  selector: 'app-products-creation',
  imports: [
    FormsModule,
    CommonModule,
    LucideAngularModule,
    ...UI_CARD,
    UiAlertComponent,
    UiButtonComponent,
    UiCheckboxComponent,
    UiFieldComponent,
    UiInputComponent,
    UiSelectComponent,
    UiTextareaComponent,
  ],
  templateUrl: './products-creation.html',
  styleUrl: './products-creation.css',
})
export class ProductsCreation implements OnInit, OnChanges {
  @Input() productToEdit: NewProduct | null = null;
  @Output() created = new EventEmitter<NewProduct>();
  @Output() updated = new EventEmitter<NewProduct>();
  @Output() cancelled = new EventEmitter<void>();

  product: NewProduct = this.emptyProduct();
  variantsText = '';
  errors: Partial<Record<keyof NewProduct, string>> = {};
  readonly originOptions = ['US', 'CO', 'EC'];
  readonly icons = { save: Check };

  get isEditMode(): boolean {
    return this.productToEdit !== null;
  }

  /*
   * ngOnChanges, not ngOnInit: on a deep link to /products/:id/edit the form mounts
   * before the catalogue has loaded, so productToEdit arrives null and only becomes
   * the product once the request resolves. Reading it once at init left the form
   * blank on reload.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (!changes['productToEdit']) return;
    this.hydrateFromInput();
  }

  ngOnInit() {
    this.hydrateFromInput();
  }

  private hydrateFromInput() {
    if (!this.productToEdit) return;

    this.product = {
      ...this.emptyProduct(),
      ...this.productToEdit,
      origin: this.normalizeOrigins(this.productToEdit.origin)
    };
    this.variantsText = this.productToEdit.variants?.join('\n') || '';
  }

  private emptyProduct(): NewProduct {
    return {
      id: '',
      name: '',
      url: '',
      origin: [],
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

    const productToSave = {
      ...this.product,
      variants,
      origin: this.normalizeOrigins(this.product.origin)
    };

    if (this.isEditMode) {
      this.updated.emit(productToSave);
    } else {
      this.created.emit(productToSave);
    }
    this.reset();
  }

  isOriginSelected(origin: string): boolean {
    return this.normalizeOrigins(this.product.origin).includes(origin);
  }

  toggleOrigin(origin: string, checked: boolean) {
    const origins = new Set(this.normalizeOrigins(this.product.origin));
    if (checked) {
      origins.add(origin);
    } else {
      origins.delete(origin);
    }

    this.product.origin = this.originOptions.filter(option => origins.has(option));
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

  private normalizeOrigins(origin: string | string[] | undefined): string[] {
    const origins = Array.isArray(origin) ? origin : origin ? [origin] : [];
    return this.originOptions.filter(option => origins.includes(option));
  }
}
