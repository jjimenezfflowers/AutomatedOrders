import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, Plus, SquarePen, Trash2 } from 'lucide-angular';

import { ProductsCreation, NewProduct } from './products-creation/products-creation';
import {
  UI_CARD,
  UiBadgeComponent,
  UiButtonComponent,
  UiConfirmDialogComponent,
  UiDataTableCellDirective,
  UiDataTableComponent,
  type UiDataTableColumn,
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
  variantsText?: string; // Helper for textarea binding
}

@Component({
  selector: 'app-products',
  imports: [
    ProductsCreation,
    LucideAngularModule,
    UiButtonComponent,
    UiBadgeComponent,
    UiDataTableComponent,
    UiDataTableCellDirective,
    ...UI_CARD,
    UiConfirmDialogComponent,
  ],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class ProductsComponent implements OnInit {
  @Input() apiEndpoint: string = '/api/products';
  /* Driven by the route now, so the form survives a reload and the back button. */
  @Input() set formMode(mode: 'new' | 'edit' | null) {
    this.requestedForm = mode;
    this.syncFormFromRoute();
  }
  @Input() set formProductId(id: string | null) {
    this.requestedProductId = id;
    this.syncFormFromRoute();
  }
  @Output() formClosed = new EventEmitter<void>();
  /* The page owns navigation; this component stays routing-agnostic. */
  @Output() createRequested = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<Product>();

  /** The product a delete is pending on; null when no confirmation is open. */
  pendingDelete: Product | null = null;

  private requestedForm: 'new' | 'edit' | null = null;
  private requestedProductId: string | null = null;

  products: Product[] = [];
  showCreation = false;
  editingProduct: NewProduct | null = null;
  editingIndex: number = -1;

  readonly icons = { add: Plus, edit: SquarePen, delete: Trash2 };

  /*
   * Column widths are grid tracks, not <td> widths: <ui-data-table> lays each row
   * out as a CSS grid. Every accessor doubles as the value the sort and the
   * per-column filter see, so the rich columns still declare one even though a
   * uiDataTableCell template is what actually renders them; `searchAccessor` is
   * for the rest of what those templates display, which the sort must not see.
   */
  readonly columns: UiDataTableColumn<Product>[] = [
    {
      id: 'product',
      header: 'Product',
      width: 'minmax(220px,2fr)',
      accessor: (product) => product.name || product.id,
      // The cell shows the handle under the name, so searching for it must work;
      // sorting stays on the name alone.
      searchAccessor: (product) => product.id,
      sortable: true,
    },
    {
      id: 'type',
      header: 'Type',
      width: 'minmax(180px,1fr)',
      accessor: (product) => this.formatType(product.type),
      // The url is the cell's subtitle, and it is how someone identifies a
      // product they only have a link for.
      searchAccessor: (product) => product.url ?? '',
      sortable: true,
      filterable: true,
    },
    {
      id: 'origin',
      header: 'Origin',
      width: 'minmax(120px,1fr)',
      accessor: (product) => this.formatOrigin(product.origin),
      filterable: true,
    },
    {
      id: 'variants',
      header: 'Variants',
      width: '140px',
      // A number, not the badge text: sorted as text, 10 variants would come before 2.
      accessor: (product) => product.variants?.length ?? 0,
      // The badge only shows how many there are; people search for the one they want.
      searchAccessor: (product) => product.variants?.join(' ') ?? '',
      sortable: true,
    },
    {
      id: 'quantity',
      header: 'Qty',
      width: '90px',
      accessor: (product) => product.defaultQuantity,
      sortable: true,
      align: 'right',
    },
    {
      id: 'actions',
      header: '',
      width: '104px',
      accessor: () => '',
      align: 'right',
    },
  ];

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
      this.syncFormFromRoute();
    });
  }

  /*
   * The route owns whether the form is open. Products may not have loaded when the
   * inputs first arrive, so this runs again after every load.
   */
  private syncFormFromRoute(): void {
    if (this.requestedForm === 'new') {
      this.editingProduct = null;
      this.editingIndex = -1;
      this.showCreation = true;
      return;
    }

    if (this.requestedForm === 'edit') {
      const index = this.products.findIndex((p) => p.id === this.requestedProductId);
      if (index < 0) {
        // Products are still loading, or the id is unknown; the load will retry.
        this.showCreation = this.products.length === 0;
        return;
      }
      this.editingProduct = { ...this.products[index] };
      this.editingIndex = index;
      this.showCreation = true;
      return;
    }

    this.showCreation = false;
    this.editingProduct = null;
    this.editingIndex = -1;
  }

  addProduct() {
    this.createRequested.emit();
  }

  editProductAt(index: number) {
    const p = this.products[index];
    this.editingProduct = { ...p };
    this.editingIndex = index;
    this.showCreation = true;
  }

  /*
   * The table sorts, filters and pages its rows, so a row action hands back the
   * product it rendered. Keying off the row's position instead would edit or
   * delete a different product as soon as the visible order stopped matching
   * this.products.
   */
  /** Ids already in the catalogue, so the form can reject a duplicate. */
  get existingProductIds(): string[] {
    return this.products.map(product => product.id);
  }

  editRow(product: Product) {
    if (this.indexOfProduct(product) >= 0) {
      this.editRequested.emit(product);
    }
  }

  /*
   * Deleting saves immediately, so it is not recoverable by walking away — it needs
   * a confirmation, which it did not have.
   */
  deleteRow(product: Product) {
    this.pendingDelete = product;
  }

  confirmDelete() {
    if (!this.pendingDelete) return;
    this.deleteProduct(this.indexOfProduct(this.pendingDelete));
    this.pendingDelete = null;
  }

  cancelDelete() {
    this.pendingDelete = null;
  }

  onProductCreated(newProduct: NewProduct) {
    this.products = [
      ...this.products,
      { ...newProduct, variantsText: newProduct.variants?.join('\n') || '' }
    ];
    this.showCreation = false;
    this.saveProducts();
      this.formClosed.emit();
  }

  onProductUpdated(updatedProduct: NewProduct) {
    if (this.editingIndex >= 0) {
      const index = this.editingIndex;
      this.products = this.products.map((product, i) =>
        i === index
          ? { ...product, ...updatedProduct, variantsText: updatedProduct.variants?.join('\n') || '' }
          : product
      );
    }
    this.editingProduct = null;
    this.editingIndex = -1;
    this.showCreation = false;
    this.saveProducts();
      this.formClosed.emit();
  }

  onCreationCancelled() {
    this.editingProduct = null;
    this.editingIndex = -1;
    this.showCreation = false;
    // The route owns the form, so leaving it is a navigation.
    this.formClosed.emit();
  }

  /*
   * Reassigns rather than splices: `products` is read through a signal input on
   * <ui-data-table>, which compares references and would not see a mutation.
   */
  deleteProduct(index: number) {
    if (index < 0 || index >= this.products.length) {
      return;
    }

    this.products = this.products.filter((_, i) => i !== index);
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

  formatType(type: string | undefined): string {
    return type === 'product-options' ? 'Product with Options' : 'Simple Product';
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

  private indexOfProduct(product: Product): number {
    return this.products.findIndex(p => p.id === product.id);
  }

  private normalizeOrigins(origin: string | string[] | undefined): string[] {
    const originOptions = ['US', 'CO', 'EC'];
    const origins = Array.isArray(origin) ? origin : origin ? [origin] : [];
    return originOptions.filter(option => origins.includes(option));
  }
}
