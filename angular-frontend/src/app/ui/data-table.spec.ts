import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiDataTableCellDirective, UiDataTableComponent, type UiDataTableColumn } from './data-table';

interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
}

const CATEGORIES = ['Roses', 'Tulips', 'Lilies'];

/**
 * 30 rows: two pages at the default page size of 25.
 *
 * `stock` is a permutation of 1..30 (7 and 30 are coprime) rather than a
 * straight run, so the source order is distinguishable from both sort
 * directions — otherwise "back to unsorted" would look identical to ascending.
 */
const PRODUCTS: Product[] = Array.from({ length: 30 }, (_, index) => ({
  id: `p-${index + 1}`,
  name: `Product ${index + 1}`,
  category: CATEGORIES[index % CATEGORIES.length],
  stock: ((index * 7) % 30) + 1,
}));

const COLUMNS: UiDataTableColumn<Product>[] = [
  {
    id: 'name',
    header: 'Name',
    width: 'minmax(200px,2fr)',
    accessor: (product) => product.name,
    sortable: true,
  },
  {
    id: 'category',
    header: 'Category',
    width: 'minmax(140px,1fr)',
    accessor: (product) => product.category,
    filterable: true,
  },
  {
    id: 'stock',
    header: 'Stock',
    width: '100px',
    accessor: (product) => product.stock,
    sortable: true,
    align: 'right',
  },
];

@Component({
  standalone: true,
  imports: [UiDataTableComponent],
  template: `
    <ui-data-table
      testId="tbl"
      [data]="data()"
      [columns]="columns()"
      [loading]="loading()"
      [emptyMessage]="emptyMessage()"
      [pageSizeOptions]="pageSizeOptions()"
    />
  `,
})
class DataTableHostComponent {
  readonly data = signal<Product[]>(PRODUCTS);
  readonly columns = signal<UiDataTableColumn<Product>[]>(COLUMNS);
  readonly loading = signal(false);
  readonly emptyMessage = signal('Nothing here yet');
  readonly pageSizeOptions = signal<number[]>([10, 25, 50, 100]);
}

@Component({
  standalone: true,
  imports: [UiDataTableComponent, UiDataTableCellDirective],
  template: `
    <ui-data-table testId="tbl" [data]="data" [columns]="columns">
      <ng-template uiDataTableCell="name" let-product let-value="value">
        <span class="custom-cell">{{ value }} ({{ product.id }})</span>
      </ng-template>
    </ui-data-table>
  `,
})
class CustomCellHostComponent {
  readonly data = PRODUCTS;
  readonly columns = COLUMNS;
}

describe('UiDataTableComponent', () => {
  let fixture: ComponentFixture<DataTableHostComponent>;
  let host: DataTableHostComponent;

  /*
   * Two passes with a microtask between them: TanStack schedules its
   * auto-reset-page-index hook with queueMicrotask after a row model recomputes,
   * so a single detectChanges renders the state before that reset lands.
   */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function query<E extends Element>(selector: string): E {
    const element = fixture.nativeElement.querySelector(selector) as E | null;
    if (!element) {
      throw new Error(`No element matched ${selector}`);
    }
    return element;
  }

  function queryAll<E extends Element>(selector: string): E[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as E[];
  }

  function rows(): HTMLElement[] {
    return queryAll<HTMLElement>('[data-testid="tbl-row"]');
  }

  function cellText(rowIndex: number, columnIndex: number): string {
    const cells = rows()[rowIndex].querySelectorAll('[role="cell"]');
    return (cells[columnIndex].textContent ?? '').trim();
  }

  function columnText(columnIndex: number): string[] {
    return rows().map((_, rowIndex) => cellText(rowIndex, columnIndex));
  }

  async function type(value: string): Promise<void> {
    const input = query<HTMLInputElement>('input[data-testid="tbl-search"]');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(testId: string, value: string): Promise<void> {
    const select = query<HTMLSelectElement>(`select[data-testid="${testId}"]`);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  async function click(testId: string): Promise<void> {
    query<HTMLButtonElement>(`button[data-testid="${testId}"]`).click();
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DataTableHostComponent);
    host = fixture.componentInstance;
    await settle();
  });

  it('renders the header and the first page of rows', () => {
    expect(queryAll('[role="columnheader"]').map((cell) => (cell.textContent ?? '').trim())).toEqual(
      ['Name', 'Category', 'Stock'],
    );

    expect(rows().length).toBe(25);
    expect(cellText(0, 0)).toBe('Product 1');
    expect(cellText(0, 2)).toBe('1');
  });

  it('lays every row out on the same grid tracks as the column widths', () => {
    // The browser normalises the track list it parses out of the width inputs.
    const template = 'minmax(200px, 2fr) minmax(140px, 1fr) 100px';

    expect(rows()[0].style.gridTemplateColumns).toBe(template);
    expect(query<HTMLElement>('[role="row"]').style.gridTemplateColumns).toBe(template);
  });

  describe('search', () => {
    it('matches across every column', async () => {
      await type('tulips');

      expect(rows().length).toBe(10);
      expect(columnText(1).every((category) => category === 'Tulips')).toBeTrue();
    });

    it('is case-insensitive', async () => {
      await type('PRODUCT 3');

      expect(columnText(0)).toEqual(['Product 3', 'Product 30']);
    });

    it('shows the empty state when nothing matches', async () => {
      await type('nothing matches this');

      expect(rows().length).toBe(0);
      expect(query('[data-testid="tbl-empty"]').textContent?.trim()).toBe('No results found');
    });

    it('resets to the first page', async () => {
      await click('tbl-next');
      expect(query('[data-testid="tbl-page-label"]').textContent?.trim()).toBe('Page 2 of 2');

      await type('product');

      expect(query('[data-testid="tbl-page-label"]').textContent?.trim()).toBe('Page 1 of 2');
      expect(cellText(0, 0)).toBe('Product 1');
    });
  });

  describe('sorting', () => {
    it('cycles ascending, descending, then back to the source order', async () => {
      expect(columnText(2).slice(0, 3)).toEqual(['1', '8', '15']);

      await click('tbl-sort-stock');
      expect(columnText(2).slice(0, 3)).toEqual(['1', '2', '3']);

      await click('tbl-sort-stock');
      expect(columnText(2).slice(0, 3)).toEqual(['30', '29', '28']);

      await click('tbl-sort-stock');
      expect(columnText(2).slice(0, 3)).toEqual(['1', '8', '15']);
    });

    it('sorts a text column in both directions', async () => {
      await click('tbl-sort-name');
      expect(columnText(0).slice(0, 2)).toEqual(['Product 1', 'Product 2']);

      await click('tbl-sort-name');
      expect(columnText(0).slice(0, 2)).toEqual(['Product 30', 'Product 29']);
    });

    it('reflects the direction in aria-sort', async () => {
      const header = () => queryAll('[role="columnheader"]')[0];

      expect(header().getAttribute('aria-sort')).toBe('none');

      await click('tbl-sort-name');
      expect(header().getAttribute('aria-sort')).toBe('ascending');

      await click('tbl-sort-name');
      expect(header().getAttribute('aria-sort')).toBe('descending');

      await click('tbl-sort-name');
      expect(header().getAttribute('aria-sort')).toBe('none');
    });

    it('orders a numeric column numerically, not lexicographically', async () => {
      await click('tbl-sort-stock');

      // Sorted as text, 10 would come second and 2 would land after 19.
      expect(columnText(2).slice(0, 4)).toEqual(['1', '2', '3', '4']);
    });
  });

  describe('column filters', () => {
    it('offers the distinct values of its column', () => {
      const options = queryAll<HTMLOptionElement>('select[data-testid="tbl-filter-category"] option');

      expect(options.map((option) => option.value)).toEqual(['', 'Lilies', 'Roses', 'Tulips']);
    });

    it('narrows the rows to the chosen value', async () => {
      await choose('tbl-filter-category', 'Roses');

      expect(rows().length).toBe(10);
      expect(columnText(1).every((category) => category === 'Roses')).toBeTrue();
    });

    it('combines with the search', async () => {
      await choose('tbl-filter-category', 'Roses');
      await type('Product 1');

      expect(columnText(0)).toEqual([
        'Product 1',
        'Product 10',
        'Product 13',
        'Product 16',
        'Product 19',
      ]);
    });

    it('clears when the placeholder option is chosen again', async () => {
      await choose('tbl-filter-category', 'Roses');
      await choose('tbl-filter-category', '');

      expect(rows().length).toBe(25);
    });
  });

  describe('page size', () => {
    it('lists the pageSizeOptions input', async () => {
      let options = queryAll<HTMLOptionElement>('select[data-testid="tbl-page-size"] option');
      expect(options.map((option) => option.value)).toEqual(['10', '25', '50', '100']);

      host.pageSizeOptions.set([5, 15]);
      await settle();

      options = queryAll<HTMLOptionElement>('select[data-testid="tbl-page-size"] option');
      expect(options.map((option) => option.value)).toEqual(['5', '15']);
    });

    it('changes how many rows render', async () => {
      await choose('tbl-page-size', '10');

      expect(rows().length).toBe(10);
      expect(query('[data-testid="tbl-count"]').textContent?.trim()).toBe('Showing 1-10 of 30');
      expect(query('[data-testid="tbl-page-label"]').textContent?.trim()).toBe('Page 1 of 3');
    });
  });

  describe('pagination', () => {
    function count(): string {
      return (query('[data-testid="tbl-count"]').textContent ?? '').trim();
    }

    function previous(): HTMLButtonElement {
      return query<HTMLButtonElement>('button[data-testid="tbl-previous"]');
    }

    function next(): HTMLButtonElement {
      return query<HTMLButtonElement>('button[data-testid="tbl-next"]');
    }

    it('moves through the pages and disables the controls at the ends', async () => {
      expect(count()).toBe('Showing 1-25 of 30');
      expect(previous().disabled).toBeTrue();
      expect(next().disabled).toBeFalse();

      await click('tbl-next');

      expect(rows().length).toBe(5);
      expect(cellText(0, 0)).toBe('Product 26');
      expect(count()).toBe('Showing 26-30 of 30');
      expect(previous().disabled).toBeFalse();
      expect(next().disabled).toBeTrue();

      await click('tbl-previous');

      expect(cellText(0, 0)).toBe('Product 1');
      expect(count()).toBe('Showing 1-25 of 30');
      expect(previous().disabled).toBeTrue();
    });
  });

  describe('empty state', () => {
    it('renders emptyMessage when there is no data at all', async () => {
      host.data.set([]);
      await settle();

      expect(rows().length).toBe(0);
      expect(query('[data-testid="tbl-empty"]').textContent?.trim()).toBe('Nothing here yet');
      expect(query('[data-testid="tbl-count"]').textContent?.trim()).toBe('Showing 0 of 0');
    });

    it('renders "No results found" when a filter excludes every row', async () => {
      await type('no such product');

      expect(query('[data-testid="tbl-empty"]').textContent?.trim()).toBe('No results found');
    });
  });

  describe('loading', () => {
    it('renders skeletons instead of rows', async () => {
      host.loading.set(true);
      await settle();

      const skeletons = queryAll('[data-testid="tbl-skeleton-row"]');
      expect(skeletons.length).toBeGreaterThan(0);
      expect(skeletons[0].querySelectorAll('.animate-pulse.bg-muted').length).toBe(3);
      expect(rows().length).toBe(0);
      expect(queryAll('[data-testid="tbl-empty"]').length).toBe(0);
    });
  });

  describe('accessibility', () => {
    it('restores the table semantics the grid layout would otherwise lose', () => {
      expect(queryAll('[role="table"]').length).toBe(1);
      expect(queryAll('[role="columnheader"]').length).toBe(3);
      // One header row plus the 25 rows of the first page.
      expect(queryAll('[role="row"]').length).toBe(26);
      expect(rows()[0].querySelectorAll('[role="cell"]').length).toBe(3);
    });

    it('marks only sortable columns with aria-sort, and sorts through real buttons', () => {
      const headers = queryAll('[role="columnheader"]');

      expect(headers[0].getAttribute('aria-sort')).toBe('none');
      expect(headers[1].hasAttribute('aria-sort')).toBeFalse();
      expect(headers[2].getAttribute('aria-sort')).toBe('none');

      expect(query('button[data-testid="tbl-sort-name"]').tagName).toBe('BUTTON');
      expect(queryAll('button[data-testid="tbl-sort-category"]').length).toBe(0);
    });
  });
});

describe('UiDataTableComponent custom cells', () => {
  let fixture: ComponentFixture<CustomCellHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomCellHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomCellHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders a projected template for its column and the accessor value elsewhere', () => {
    const firstRow = fixture.nativeElement.querySelector('[data-testid="tbl-row"]') as HTMLElement;
    const cells = firstRow.querySelectorAll('[role="cell"]');

    expect((cells[0].querySelector('.custom-cell')?.textContent ?? '').trim()).toBe(
      'Product 1 (p-1)',
    );
    expect((cells[1].textContent ?? '').trim()).toBe('Roses');
  });
});
