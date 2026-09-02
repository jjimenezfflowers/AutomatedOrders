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
});
