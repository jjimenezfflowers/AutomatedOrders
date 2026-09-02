import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProductsComponent } from './products';

const PRODUCTS = [
  {
    id: 'roses',
    name: 'Roses',
    url: 'https://example.test/roses',
    quantitySelector: '#qty',
    defaultQuantity: 1,
    variants: ['Small', 'Large']
  },
  {
    id: 'tulips',
    name: 'Tulips',
    url: 'https://example.test/tulips',
    quantitySelector: '#qty',
    defaultQuantity: 2
  }
];

describe('ProductsComponent', () => {
  let component: ProductsComponent;
  let fixture: ComponentFixture<ProductsComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function completeInit(products: Object = PRODUCTS) {
    httpMock.expectOne('/api/products').flush(products);
    detect();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    spyOn(window, 'alert');

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    detect();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    completeInit();
    expect(component).toBeTruthy();
  });

  // --- Defect 6: deleteProduct must persist ---------------------------------------

  describe('deleteProduct', () => {
    it('POSTs the remaining products so the deletion survives a reload', () => {
      completeInit();

      component.deleteProduct(0);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body.map((p: { id: string }) => p.id)).toEqual(['tulips']);
      post.flush({});
    });

    it('strips the variantsText view helper from the persisted payload', () => {
      completeInit();

      component.deleteProduct(1);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body[0].variantsText).toBeUndefined();
      expect(post.request.body[0].variants).toEqual(['Small', 'Large']);
      post.flush({});
    });

    it('persists to the configured apiEndpoint', () => {
      component.apiEndpoint = '/api/staging-products';
      component.loadProducts();
      httpMock.expectOne('/api/products').flush(PRODUCTS); // request from ngOnInit
      httpMock.expectOne('/api/staging-products').flush(PRODUCTS);

      component.deleteProduct(0);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/staging-products');
      expect(post.request.body.map((p: { id: string }) => p.id)).toEqual(['tulips']);
      post.flush({});
    });
  });

  // --- Neighbouring persist paths --------------------------------------------------

  describe('create and update', () => {
    it('persists a created product', () => {
      completeInit();

      component.onProductCreated({
        id: 'lilies',
        name: 'Lilies',
        url: 'https://example.test/lilies',
        quantitySelector: '#qty',
        defaultQuantity: 1
      } as never);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body.map((p: { id: string }) => p.id)).toEqual(['roses', 'tulips', 'lilies']);
      post.flush({});
    });

    it('persists an updated product', () => {
      completeInit();

      component.editProductAt(1);
      component.onProductUpdated({ ...PRODUCTS[1], name: 'Yellow Tulips' } as never);

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body[1].name).toBe('Yellow Tulips');
      post.flush({});
    });
  });

  describe('loadProducts', () => {
    it('dedupes by id', () => {
      completeInit([...PRODUCTS, { ...PRODUCTS[0] }]);

      expect(component.products.map(p => p.id)).toEqual(['roses', 'tulips']);
    });
  });

  // --- Design-system migration: the list must keep rendering the same information
  // through the ui-* primitives instead of hand-written Tailwind. ------------------

  describe('design-system rendering', () => {
    function query(selector: string): HTMLElement | null {
      return fixture.nativeElement.querySelector(selector);
    }

    function queryAll(selector: string): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll(selector));
    }

    it('renders one row per product returned by /api/products', () => {
      completeInit();

      const rows = queryAll('[data-testid="product-row"]');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('Roses');
      expect(rows[0].textContent).toContain('roses');
      expect(rows[1].textContent).toContain('Tulips');
    });

    it('renders the card surface and table through ui-card', () => {
      completeInit();

      expect(query('[data-testid="products-card"]')).toBeTruthy();
      expect(query('[data-testid="products-table"]')).toBeTruthy();
    });

    it('renders the primary action as a ui-button that opens the creation form', () => {
      completeInit();

      const addButton = query('[data-testid="add-product"]')!;
      expect(addButton).toBeTruthy();
      expect(addButton.tagName).toBe('BUTTON');
      expect(component.showCreation).toBeFalse();

      addButton.click();
      detect();

      expect(component.showCreation).toBeTrue();
      expect(query('app-products-creation')).toBeTruthy();
    });

    it('still persists from the header and footer save buttons', () => {
      completeInit();

      query('[data-testid="save-all"]')!.click();
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});

      query('[data-testid="save-products"]')!.click();
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});
    });

    it('still deletes from the row action button', () => {
      completeInit();

      query('[data-testid="delete-product-0"]')!.click();
      detect();

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body.map((p: { id: string }) => p.id)).toEqual(['tulips']);
      post.flush({});
      expect(queryAll('[data-testid="product-row"]').length).toBe(1);
    });

    it('shows variant counts as semantic badges', () => {
      completeInit();

      const badges = queryAll('ui-badge span[class]');
      expect(badges[0].className).toContain('text-success');
      expect(badges[0].textContent).toContain('2 variants');
      expect(badges[1].textContent).toContain('none');
    });

    /*
     * products.html itself carries no form controls -- the edit form lives in the
     * app-products-creation child. The field round-trip that this template owns is
     * the edit button -> editingProduct -> products[] -> rendered row path.
     */
    it('round-trips an edited field back into the model and the rendered row', () => {
      completeInit();

      query('[data-testid="edit-product-1"]')!.click();
      detect();

      expect(component.editingProduct?.name).toBe('Tulips');

      component.onProductUpdated({ ...PRODUCTS[1], name: 'Yellow Tulips' } as never);
      detect();

      expect(component.products[1].name).toBe('Yellow Tulips');
      expect(queryAll('[data-testid="product-row"]')[1].textContent).toContain('Yellow Tulips');

      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});
    });

    /*
     * bg-white is what pinned the old card to a light surface regardless of theme.
     * The themed tokens (bg-card / bg-muted) are what make dark mode work.
     */
    it('renders no hardcoded bg-white, so the surface follows the theme', () => {
      completeInit();

      const markup: string = fixture.nativeElement.innerHTML;
      expect(markup).not.toContain('bg-white');
      expect(markup).not.toContain('text-slate-');
      expect(markup).toContain('bg-card');
    });
  });
});
