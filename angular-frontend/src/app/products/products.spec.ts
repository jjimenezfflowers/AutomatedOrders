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

/*
 * A catalogue big enough to exercise the table: 12 rows (two pages at the page
 * size of 10 the template asks for), both product types, both origins, and a
 * variant count per product that is a permutation of 1..12 rather than a run --
 * so "sorted by variants" is distinguishable from the source order, and 2 and 10
 * are both present for the lexicographic-sort trap.
 */
const TABLE_NAMES = [
  'Zinnias', 'Anemones', 'Begonias', 'Carnations', 'Dahlias', 'Eucalyptus',
  'Freesia', 'Gardenias', 'Hydrangeas', 'Irises', 'Jasmine', 'Kalanchoe'
];
const TABLE_VARIANT_COUNTS = [3, 10, 1, 2, 12, 5, 7, 4, 9, 6, 11, 8];

const TABLE_PRODUCTS = TABLE_NAMES.map((name, index) => ({
  id: name.toLowerCase(),
  name,
  url: `https://example.test/${name.toLowerCase()}`,
  type: index % 2 === 0 ? 'product-options' : 'simple',
  origin: index % 3 === 0 ? 'US' : 'CO',
  quantitySelector: '#qty',
  defaultQuantity: index + 1,
  // Distinct per product, so a search for one variant identifies one row.
  variants: Array.from(
    { length: TABLE_VARIANT_COUNTS[index] },
    (_, i) => `${name.slice(0, 3).toUpperCase()}-${i + 1}`
  )
}));

describe('ProductsComponent', () => {
  let component: ProductsComponent;
  let fixture: ComponentFixture<ProductsComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  /*
   * Two render passes with a microtask between them: TanStack schedules its
   * auto-reset-page-index hook with queueMicrotask once a row model recomputes,
   * so a single pass renders the state from before that reset lands.
   */
  async function settle(): Promise<void> {
    detect();
    await fixture.whenStable();
    detect();
  }

  function completeInit(products: Object = PRODUCTS) {
    httpMock.expectOne('/api/products').flush(products);
    detect();
  }

  async function completeInitAndSettle(products: Object = PRODUCTS): Promise<void> {
    httpMock.expectOne('/api/products').flush(products);
    await settle();
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

    it('ignores an index that is not in the list instead of dropping the last row', () => {
      completeInit();

      component.deleteProduct(-1);

      httpMock.expectNone(r => r.method === 'POST');
      expect(component.products.map(p => p.id)).toEqual(['roses', 'tulips']);
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

    function rows(): HTMLElement[] {
      return queryAll('[data-testid="products-row"]');
    }

    it('renders one row per product returned by /api/products', async () => {
      await completeInitAndSettle();

      expect(rows().length).toBe(2);
      expect(rows()[0].textContent).toContain('Roses');
      expect(rows()[0].textContent).toContain('roses');
      expect(rows()[1].textContent).toContain('Tulips');
    });

    it('renders the card surface and the list through ui-card and ui-data-table', async () => {
      await completeInitAndSettle();

      expect(query('[data-testid="products-card"]')).toBeTruthy();
      expect(query('ui-data-table')).toBeTruthy();
      expect(query('[data-testid="products"]')).toBeTruthy();
    });

    it('renders the primary action as a ui-button that asks for the creation form', async () => {
      await completeInitAndSettle();

      const addButton = query('[data-testid="add-product"]')!;
      expect(addButton).toBeTruthy();
      expect(addButton.tagName).toBe('BUTTON');
      expect(component.showCreation).toBeFalse();

      let requested = 0;
      component.createRequested.subscribe(() => requested++);

      addButton.click();
      await settle();

      // The page turns this into a navigation to /products/new.
      expect(requested).toBe(1);

      component.formMode = 'new';
      await settle();

      expect(component.showCreation).toBeTrue();
      expect(query('app-products-creation')).toBeTruthy();
    });

    it('still persists from the header and footer save buttons', async () => {
      await completeInitAndSettle();

      query('[data-testid="save-all"]')!.click();
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});

      query('[data-testid="save-products"]')!.click();
      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});
    });

    it('still deletes from the row action button', async () => {
      await completeInitAndSettle();

      query('[data-testid="delete-product-roses"]')!.click();
      await settle();

      const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
      expect(post.request.body.map((p: { id: string }) => p.id)).toEqual(['tulips']);
      post.flush({});
      expect(rows().length).toBe(1);
    });

    it('shows variant counts as semantic badges', async () => {
      await completeInitAndSettle();

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
    it('round-trips an edited field back into the model and the rendered row', async () => {
      await completeInitAndSettle();

      component.formMode = 'edit';
      component.formProductId = 'tulips';
      await settle();

      expect(component.editingProduct?.name).toBe('Tulips');

      component.onProductUpdated({ ...PRODUCTS[1], name: 'Yellow Tulips' } as never);
      await settle();

      expect(component.products[1].name).toBe('Yellow Tulips');
      expect(rows()[1].textContent).toContain('Yellow Tulips');

      httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});
    });

    /*
     * bg-white is what pinned the old card to a light surface regardless of theme.
     * The themed tokens (bg-card / bg-muted) are what make dark mode work.
     */
    it('renders no hardcoded bg-white, so the surface follows the theme', async () => {
      await completeInitAndSettle();

      const markup: string = fixture.nativeElement.innerHTML;
      expect(markup).not.toContain('bg-white');
      expect(markup).not.toContain('text-slate-');
      expect(markup).toContain('bg-card');
    });
  });

  // --- The data table: search, filters, sorting, paging, and row actions that
  // survive all four. ---------------------------------------------------------------

  describe('data table', () => {
    function queryOne<E extends Element>(selector: string): E {
      const element = fixture.nativeElement.querySelector(selector) as E | null;
      if (!element) {
        throw new Error(`No element matched ${selector}`);
      }
      return element;
    }

    function rows(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="products-row"]'));
    }

    /** The first <p> of a row is the product name inside the `product` cell template. */
    function names(): string[] {
      return rows().map(row => (row.querySelector('p')?.textContent ?? '').trim());
    }

    function cellText(rowIndex: number, columnIndex: number): string {
      const cells = rows()[rowIndex].querySelectorAll('[role="cell"]');
      return (cells[columnIndex].textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    async function type(value: string): Promise<void> {
      const input = queryOne<HTMLInputElement>('input[data-testid="products-search"]');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    }

    async function choose(testId: string, value: string): Promise<void> {
      const select = queryOne<HTMLSelectElement>(`select[data-testid="${testId}"]`);
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle();
    }

    async function click(testId: string): Promise<void> {
      queryOne<HTMLButtonElement>(`[data-testid="${testId}"]`).click();
      await settle();
    }

    beforeEach(async () => {
      await completeInitAndSettle(TABLE_PRODUCTS);
    });

    it('renders the columns the page needs, one row per product on the first page', () => {
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('[role="columnheader"]'))
          .map(cell => ((cell as HTMLElement).textContent ?? '').trim())
      ).toEqual(['Product', 'Type', 'Origin', 'Variants', 'Qty', '']);

      // 12 products, page size 10.
      expect(rows().length).toBe(10);
      expect(queryOne('[data-testid="products-count"]').textContent?.trim())
        .toBe('Showing 1-10 of 12');
    });

    it('keeps everything the old hand-rolled row showed', () => {
      expect(cellText(0, 0)).toContain('Zinnias');
      expect(cellText(0, 0)).toContain('zinnias');
      expect(cellText(0, 1)).toContain('Product with Options');
      expect(cellText(0, 1)).toContain('https://example.test/zinnias');
      expect(cellText(0, 2)).toBe('US');
      expect(cellText(0, 3)).toBe('3 variants');
      expect(cellText(0, 4)).toBe('1');
      expect(rows()[0].querySelector('[data-testid="edit-product-zinnias"]')).toBeTruthy();
      expect(rows()[0].querySelector('[data-testid="delete-product-zinnias"]')).toBeTruthy();
    });

    describe('search', () => {
      it('narrows the rows to the matching products', async () => {
        await type('dahlias');

        expect(names()).toEqual(['Dahlias']);
      });

      it('matches the handle as well as the name', async () => {
        await type('hydrangeas');

        expect(names()).toEqual(['Hydrangeas']);
      });

      /*
       * These three are what searchAccessor buys: the cell shows a url or a
       * variant count, and the row is still findable by the text behind it --
       * without the variant names leaking into the numeric sort.
       */
      it('matches the url the type cell shows', async () => {
        await type('example.test/freesia');

        expect(names()).toEqual(['Freesia']);
      });

      it('matches a variant name the badge only counts', async () => {
        await type('kal-8');

        expect(names()).toEqual(['Kalanchoe']);
      });

      it('still sorts variants by count, not by the variant names it matches', async () => {
        await click('products-sort-variants');

        expect(names().slice(0, 4)).toEqual(['Begonias', 'Carnations', 'Zinnias', 'Gardenias']);
      });

      it('shows the empty state when nothing matches', async () => {
        await type('no such flower');

        expect(rows().length).toBe(0);
        expect(queryOne('[data-testid="products-empty"]').textContent?.trim())
          .toBe('No results found');
      });
    });

    describe('sorting', () => {
      it('orders by name alphabetically', async () => {
        await click('products-sort-product');

        expect(names().slice(0, 3)).toEqual(['Anemones', 'Begonias', 'Carnations']);

        await click('products-sort-product');

        expect(names().slice(0, 3)).toEqual(['Zinnias', 'Kalanchoe', 'Jasmine']);
      });

      it('orders by variant count numerically, not lexicographically', async () => {
        await click('products-sort-variants');

        // Carnations has 2 variants and Anemones has 10; sorted as text, "10"
        // would come second and "2" would land after "12".
        expect(cellText(0, 3)).toBe('1 variant');
        expect(cellText(1, 3)).toBe('2 variants');
        expect(names().slice(0, 4)).toEqual(['Begonias', 'Carnations', 'Zinnias', 'Gardenias']);
      });

      it('orders by quantity numerically', async () => {
        await click('products-sort-quantity');

        expect(rows().map((_, index) => cellText(index, 4)).slice(0, 4))
          .toEqual(['1', '2', '3', '4']);
      });
    });

    describe('column filters', () => {
      it('narrows the rows to the chosen type', async () => {
        await choose('products-filter-type', 'Simple Product');

        // The odd-indexed half of the catalogue.
        expect(names()).toEqual([
          'Anemones', 'Carnations', 'Eucalyptus', 'Gardenias', 'Irises', 'Kalanchoe'
        ]);
      });

      it('narrows the rows to the chosen origin', async () => {
        await choose('products-filter-origin', 'US');

        expect(names()).toEqual(['Zinnias', 'Carnations', 'Freesia', 'Irises']);
      });

      it('clears when the placeholder option is chosen again', async () => {
        await choose('products-filter-type', 'Simple Product');
        await choose('products-filter-type', '');

        expect(rows().length).toBe(10);
      });
    });

    describe('page size', () => {
      it('changes how many rows render', async () => {
        expect(rows().length).toBe(10);

        await choose('products-page-size', '25');

        expect(rows().length).toBe(12);
        expect(queryOne('[data-testid="products-count"]').textContent?.trim())
          .toBe('Showing 1-12 of 12');
      });
    });

    /*
     * The row actions used to be `edit-product-{index}` / `delete-product-{index}`
     * keyed off the position in `products`. Once the table sorts and pages, that
     * position no longer matches what the row displays, so the buttons are keyed
     * off the product id and resolve the model entry themselves. Each of these
     * would act on the wrong product under the old scheme.
     */
    describe('row actions after sorting and paging', () => {
      it('deletes the product the row actually shows, not products[rowIndex]', async () => {
        await click('products-sort-product');
        expect(names()[0]).toBe('Anemones');

        await click('delete-product-anemones');

        const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
        const persisted = post.request.body.map((p: { id: string }) => p.id);
        expect(persisted).not.toContain('anemones');
        // Zinnias is products[0] -- what an index-keyed action would have removed.
        expect(persisted).toContain('zinnias');
        expect(persisted.length).toBe(11);
        post.flush({});

        await settle();
        expect(names()).not.toContain('Anemones');
      });

      it('asks to edit the product the row actually shows on a later page', async () => {
        await click('products-next');
        expect(names()).toEqual(['Jasmine', 'Kalanchoe']);

        const requested: any[] = [];
        component.editRequested.subscribe(p => requested.push(p));

        await click('edit-product-jasmine');

        expect(requested.length).toBe(1);
        expect(requested[0].id).toBe('jasmine');
      });

      /*
       * The component asks the page to open the form now, rather than opening it
       * itself: create and edit are routes, so the URL changes and the back button
       * works. What still matters is that the request names the product the row
       * actually shows, which an index-keyed action would get wrong once sorted.
       */
      it('asks to edit the product the row actually shows after a sort', async () => {
        const requested: any[] = [];
        component.editRequested.subscribe(p => requested.push(p));

        await click('products-sort-variants');
        expect(names()[0]).toBe('Begonias');

        await click('edit-product-begonias');

        expect(requested.length).toBe(1);
        expect(requested[0].name).toBe('Begonias');
      });

      it('saves the edited product back into the row it came from', async () => {
        await click('products-sort-product');
        // The route would normally open the form; drive it directly here.
        component.formMode = 'edit';
        component.formProductId = 'anemones';
        await settle();

        component.onProductUpdated({ ...TABLE_PRODUCTS[1], name: 'Red Anemones' } as never);
        httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products').flush({});
        await settle();

        expect(component.products[1].name).toBe('Red Anemones');
        expect(component.products.map(p => p.id)).toEqual(TABLE_PRODUCTS.map(p => p.id));
        expect(names()).toContain('Red Anemones');
      });
    });

    describe('the creation form', () => {
      it('still opens the form and saves a new product', async () => {
        // Add Product is a navigation now; the route sets formMode.
        component.formMode = 'new';
        await settle();

        expect(fixture.nativeElement.querySelector('app-products-creation')).toBeTruthy();

        component.onProductCreated({
          id: 'lilies',
          name: 'Lilies',
          url: 'https://example.test/lilies',
          quantitySelector: '#qty',
          defaultQuantity: 1
        } as never);

        const post = httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/products');
        expect(post.request.body.length).toBe(13);
        expect(post.request.body[12].id).toBe('lilies');
        post.flush({});

        await settle();
        expect(fixture.nativeElement.querySelector('app-products-creation')).toBeFalsy();
        expect(queryOne('[data-testid="products-count"]').textContent?.trim())
          .toBe('Showing 1-10 of 13');
      });
    });
  });
});
