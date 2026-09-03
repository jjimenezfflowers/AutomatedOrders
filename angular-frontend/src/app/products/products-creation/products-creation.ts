import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
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

import {
  PRODUCT_FIELD_CONTROLS,
  PRODUCT_FIELDS,
  ProductFormValues,
  productFieldError,
  productFormErrors,
} from './products-creation.schema';

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
  /*
   * The catalogue's existing ids. A duplicate is not a format problem: the products
   * list deduplicates by id, so saving one would silently drop a product.
   */
  @Input() existingIds: string[] = [];
  @Output() created = new EventEmitter<NewProduct>();
  @Output() updated = new EventEmitter<NewProduct>();
  @Output() cancelled = new EventEmitter<void>();

  product: NewProduct = this.emptyProduct();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  variantsText = '';
  errors: Record<string, string | undefined> = {};
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

  /* Validate when a field is left, not on every keystroke. */
  onFieldBlur(field: string): void {
    this.validateField(field as keyof ProductFormValues);
  }

  /*
   * Only re-checks a field already showing a message, so a half-typed URL is not
   * flagged, but a corrected one clears as soon as it is right.
   */
  onFieldInput(field: string): void {
    if (this.errors[field]) this.validateField(field as keyof ProductFormValues);
  }

  private validateField(field: keyof ProductFormValues): void {
    const message = productFieldError(field, this.formValues()[field]);

    if (!message && field === 'id') {
      const id = this.product.id.trim();
      // Editing keeps its own id, so only a new product can collide.
      const collides = !this.isEditMode && id.length > 0 && this.existingIds.includes(id);
      this.setError('id', collides ? 'A product with that ID already exists.' : null);
      return;
    }

    this.setError(field, message);
  }

  /** Deletes rather than blanks, so `errors` is empty when the form is clean. */
  private setError(field: string, message: string | null): void {
    if (message) {
      this.errors[field] = message;
    } else {
      delete this.errors[field];
    }
  }

  private formValues(): Partial<ProductFormValues> {
    return {
      id: this.product.id,
      name: this.product.name,
      url: this.product.url,
      variantSelector: this.product.variantSelector ?? '',
      quantitySelector: this.product.quantitySelector,
      defaultQuantity: this.product.defaultQuantity,
    };
  }

  private validate(): boolean {
    this.errors = productFormErrors(this.formValues(), {
      // Editing keeps its own id, so it cannot collide with itself.
      existingIds: this.isEditMode ? [] : this.existingIds,
    });

    if (Object.keys(this.errors).length === 0) return true;

    this.focusFirstInvalid();
    return false;
  }

  private focusFirstInvalid(): void {
    const field = PRODUCT_FIELDS.find(candidate => this.errors[candidate]);
    if (!field) return;

    const controlId = PRODUCT_FIELD_CONTROLS[field];
    this.host.nativeElement.querySelector<HTMLElement>(`#${controlId}`)?.focus();
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
