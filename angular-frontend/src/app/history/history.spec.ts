import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { HistoryComponent } from './history';

describe('HistoryComponent', () => {
  let component: HistoryComponent;
  let fixture: ComponentFixture<HistoryComponent>;
  let httpMock: HttpTestingController;

  /**
   * Zoneless TestBed: state mutated outside CD must be marked dirty before rendering.
   *
   * Two passes with a microtask between them, as in data-table.spec.ts: TanStack
   * schedules its auto-reset-page-index hook with queueMicrotask after a row
   * model recomputes, so a single pass renders the state before that reset lands.
   */
  async function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await detect();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    httpMock.match(() => true).forEach(r => r.flush([]));
    expect(component).toBeTruthy();
  });

  describe('entries without a captured order number', () => {
    // place-order.spec.js used to store the confirmation heading verbatim
    // ("Your order is confirmed", "Order summary"). It now records null when the
    // page exposes nothing usable, so the list has to render that case.
    async function flushHistory(entries: unknown[]) {
      httpMock.match(() => true).forEach(r => r.flush(entries));
      await detect();
    }

    const entry = (orderNumber: string | null) => ({
      orderNumber,
      date: '2026-09-02T19:55:34.826Z',
      environment: 'dev',
      products: [{ productId: 'floreana-white-spray-roses', quantity: 1 }],
      customer: 'jose@fiftyflowers.com',
      total: 'N/A'
    });

    it('renders a placeholder instead of a bare hash', async () => {
      await flushHistory([entry(null)]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('order number not captured');
      expect(text).not.toContain('#null');
    });

    it('still renders a real order number', async () => {
      await flushHistory([entry('DEV-BB-50F2327')]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('#DEV-BB-50F2327');
      expect(text).not.toContain('order number not captured');
    });

    it('keeps both kinds of entry in the list', async () => {
      await flushHistory([entry(null), entry('DEV-BB-50F2328')]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('order number not captured');
      expect(text).toContain('#DEV-BB-50F2328');
    });
  });

  describe('design-system migration', () => {
    function html(): string {
      return (fixture.nativeElement as HTMLElement).innerHTML;
    }

    async function flushHistory(entries: unknown[]) {
      httpMock.match(() => true).forEach(r => r.flush(entries));
      await detect();
    }

    const entry = (environment: string) => ({
      orderNumber: 'DEV-BB-50F2327',
      date: '2026-09-02T19:55:34.826Z',
      environment,
      products: [{ productId: 'floreana-white-spray-roses', quantity: 1 }],
      customer: 'jose@fiftyflowers.com',
      total: 'N/A'
    });

    it('drops the hardcoded surfaces that would stay light in dark mode', async () => {
      await flushHistory([entry('dev')]);

      expect(html()).not.toContain('bg-white');
      expect(html()).not.toContain('bg-green-100');
      expect(html()).not.toContain('bg-yellow-100');
    });

    it('marks a dev entry with the success token', async () => {
      await flushHistory([entry('dev')]);

      const badge = fixture.nativeElement.querySelector('ui-badge span, ui-badge div');
      expect(badge.className).toContain('success');
    });

    it('marks a staging entry with the warning token', async () => {
      await flushHistory([entry('staging')]);

      const badge = fixture.nativeElement.querySelector('ui-badge span, ui-badge div');
      expect(badge.className).toContain('warning');
    });

    it('shows a real empty state rather than a bare sentence', async () => {
      await flushHistory([]);

      expect(html()).toContain('No orders placed yet');
      expect(fixture.nativeElement.querySelector('lucide-angular')).not.toBeNull();
    });
  });

  describe('data table', () => {
    /*
     * Read off the component rather than written down, so inserting a column
     * moves these instead of silently pointing every assertion one cell to the
     * left — which is exactly what adding Confirmation and Total did.
     */
    const columnIndex = (id: string) => {
      const index = new HistoryComponent(null as never).columns.findIndex(
        (column) => column.id === id,
      );
      if (index < 0) throw new Error(`HistoryComponent has no column "${id}"`);
      return index;
    };

    const ORDER = columnIndex('orderNumber');
    const CONFIRMATION = columnIndex('confirmationNumber');
    const ENVIRONMENT = columnIndex('environment');
    const DATE = columnIndex('date');
    const DELIVERY = columnIndex('delivery');
    const CUSTOMER = columnIndex('customer');
    const TOTAL = columnIndex('total');
    const PRODUCTS = columnIndex('products');

    interface EntryOverrides {
      orderNumber?: string | null;
      date?: string;
      environment?: string;
      customer?: string;
      productCount?: number;
      confirmationNumber?: string | null;
      total?: string;
    }

    function entry(overrides: EntryOverrides = {}) {
      const {
        orderNumber = 'DEV-BB-50F2327',
        date = '2026-09-02T19:55:34.826Z',
        environment = 'dev',
        customer = 'jose@fiftyflowers.com',
        productCount = 1,
        confirmationNumber = null,
        total = 'N/A'
      } = overrides;

      return {
        orderNumber,
        confirmationNumber,
        date,
        environment,
        customer,
        total,
        products: Array.from({ length: productCount }, (_, index) => ({
          productId: `product-${index + 1}`,
          quantity: index + 1,
          variant: `${index + 1} bunches`
        }))
      };
    }

    async function flushHistory(entries: unknown[]) {
      httpMock.match(() => true).forEach(r => r.flush(entries));
      await detect();
    }

    function query<E extends Element>(selector: string): E {
      const element = fixture.nativeElement.querySelector(selector) as E | null;
      if (!element) {
        throw new Error(`No element matched ${selector}`);
      }
      return element;
    }

    function rows(): HTMLElement[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="history-row"]')
      ) as HTMLElement[];
    }

    function cellText(rowIndex: number, columnIndex: number): string {
      const cells = rows()[rowIndex].querySelectorAll('[role="cell"]');
      return (cells[columnIndex].textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    function columnText(columnIndex: number): string[] {
      return rows().map((_, rowIndex) => cellText(rowIndex, columnIndex));
    }

    async function type(value: string) {
      const input = query<HTMLInputElement>('input[data-testid="history-search"]');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await detect();
    }

    async function choose(testId: string, value: string) {
      const select = query<HTMLSelectElement>(`select[data-testid="${testId}"]`);
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await detect();
    }

    async function click(testId: string) {
      query<HTMLButtonElement>(`button[data-testid="${testId}"]`).click();
      await detect();
    }

    it('renders one row per entry returned by /api/order-history', async () => {
      await flushHistory([
        entry({ orderNumber: 'DEV-BB-1' }),
        entry({ orderNumber: 'DEV-BB-2' }),
        entry({ orderNumber: 'DEV-BB-3' })
      ]);

      expect(rows().length).toBe(3);
      expect(query('[data-testid="history-count"]').textContent?.trim()).toBe('Showing 1-3 of 3');
    });

    it('lists the newest entry first, whatever order the file is in', async () => {
      // The file appends, so the API hands back the oldest run first.
      await flushHistory([
        entry({ orderNumber: 'BB-OLDEST-1', date: '2026-01-05T10:00:00.000Z' }),
        entry({ orderNumber: 'BB-MIDDLE-2', date: '2026-06-05T10:00:00.000Z' }),
        entry({ orderNumber: 'BB-NEWEST-3', date: '2026-09-05T10:00:00.000Z' })
      ]);

      expect(columnText(ORDER)).toEqual(['#BB-NEWEST-3', '#BB-MIDDLE-2', '#BB-OLDEST-1']);
    });

    describe('search', () => {
      const entries = [
        entry({ orderNumber: 'DEV-BB-50F2327', customer: 'jose@fiftyflowers.com' }),
        entry({ orderNumber: 'DEV-BB-50F2328', customer: 'alice@fiftyflowers.com' }),
        entry({ orderNumber: 'STG-BB-90210', customer: 'bob@example.com' })
      ];

      it('matches the order number', async () => {
        await flushHistory(entries);
        await type('50F2328');

        expect(columnText(ORDER)).toEqual(['#DEV-BB-50F2328']);
      });

      it('matches the customer email', async () => {
        await flushHistory(entries);
        await type('alice@');

        expect(columnText(CUSTOMER)).toEqual(['alice@fiftyflowers.com']);
      });

      it('is case-insensitive', async () => {
        await flushHistory(entries);
        await type('stg-bb');

        expect(columnText(ORDER)).toEqual(['#STG-BB-90210']);
      });
    });

    describe('environment filter', () => {
      const entries = [
        entry({ orderNumber: 'DEV-1', environment: 'dev' }),
        entry({ orderNumber: 'DEV-2', environment: 'dev' }),
        entry({ orderNumber: 'STG-1', environment: 'staging' })
      ];

      it('offers the environments present in the data', async () => {
        await flushHistory(entries);

        const options = Array.from(
          fixture.nativeElement.querySelectorAll(
            'select[data-testid="history-filter-environment"] option'
          )
        ) as HTMLOptionElement[];

        expect(options.map(option => option.value)).toEqual(['', 'DEV', 'Staging']);
      });

      it('narrows to the staging runs', async () => {
        await flushHistory(entries);
        await choose('history-filter-environment', 'Staging');

        expect(columnText(ORDER)).toEqual(['#STG-1']);
        expect(columnText(ENVIRONMENT)).toEqual(['Staging']);
      });

      it('narrows to the dev runs', async () => {
        await flushHistory(entries);
        await choose('history-filter-environment', 'DEV');

        expect(columnText(ORDER)).toEqual(['#DEV-1', '#DEV-2']);
      });

      it('treats an entry recorded before the staging runs existed as dev', async () => {
        // 144 of the 476 entries have no `environment` key at all. The staging
        // entry is here so the filter has two options and actually renders.
        await flushHistory([
          { ...entry({ orderNumber: 'BB-LEGACY-1' }), environment: undefined },
          entry({ orderNumber: 'STG-BB-1', environment: 'staging' })
        ]);
        await choose('history-filter-environment', 'DEV');

        expect(columnText(ORDER)).toEqual(['#BB-LEGACY-1']);
      });

      it('does not render a filter whose only option is the one already showing', async () => {
        // A dropdown offering a single value narrows nothing; the customer column
        // is the real case, since every entry in the file shares one address.
        await flushHistory([entry({ orderNumber: 'BB-1' }), entry({ orderNumber: 'BB-2' })]);

        expect(
          fixture.nativeElement.querySelector('select[data-testid="history-filter-environment"]')
        ).toBeNull();
        expect(
          fixture.nativeElement.querySelector('select[data-testid="history-filter-customer"]')
        ).toBeNull();
      });
    });

    describe('what the Admin API adds', () => {
      it('shows the confirmation number the store reported', async () => {
        // Scraping never had access to this: it is Shopify's own reference, and
        // the confirmation page does not expose it in a form worth reading.
        await flushHistory([entry({ confirmationNumber: 'FUY0HXCMI' })]);

        expect(cellText(0, CONFIRMATION)).toBe('FUY0HXCMI');
      });

      it('leaves the confirmation blank for entries written before the integration', async () => {
        // Those orders are real; they just have no reference recorded, and an
        // invented placeholder would read as data.
        await flushHistory([entry({ confirmationNumber: null })]);

        expect(cellText(0, CONFIRMATION)).toBe('');
      });

      it('shows a real total', async () => {
        await flushHistory([entry({ total: '114.86 USD' })]);

        expect(cellText(0, TOTAL)).toBe('114.86 USD');
      });

      it('shows a dash for the N/A every older entry carries', async () => {
        // 479 of the 480 entries read 'N/A', because a total could never be read
        // off a page whose browser had already closed.
        await flushHistory([entry({ total: 'N/A' })]);

        expect(cellText(0, TOTAL)).toBe('—');
      });

      it('finds an order by its confirmation number', async () => {
        await flushHistory([
          entry({ orderNumber: 'DEV-1', confirmationNumber: 'FUY0HXCMI' }),
          entry({ orderNumber: 'DEV-2', confirmationNumber: 'AQ5ZZCVJH' })
        ]);

        await type('FUY0HXCMI');

        expect(columnText(ORDER)).toEqual(['#DEV-1']);
      });
    });

    describe('sorting', () => {
      it('orders dates chronologically, not by their formatted text', async () => {
        /*
         * Every pair here inverts when sorted as a formatted date string:
         * "1/1/2026" < "12/31/2025" lexicographically, "9/10" < "9/2", and
         * "Aug" < "Sep" only by luck of the alphabet.
         */
        await flushHistory([
          entry({ orderNumber: 'BB-DEC-1', date: '2025-12-31T10:00:00.000Z' }),
          entry({ orderNumber: 'BB-JAN-1', date: '2026-01-01T10:00:00.000Z' }),
          entry({ orderNumber: 'BB-AUG-1', date: '2026-08-31T10:00:00.000Z' }),
          entry({ orderNumber: 'SEP-2', date: '2026-09-02T10:00:00.000Z' }),
          entry({ orderNumber: 'SEP-10', date: '2026-09-10T10:00:00.000Z' })
        ]);

        await click('history-sort-date');
        expect(columnText(ORDER)).toEqual(['#BB-DEC-1', '#BB-JAN-1', '#BB-AUG-1', '#SEP-2', '#SEP-10']);

        await click('history-sort-date');
        expect(columnText(ORDER)).toEqual(['#SEP-10', '#SEP-2', '#BB-AUG-1', '#BB-JAN-1', '#BB-DEC-1']);
      });

      it('orders the product count numerically', async () => {
        await flushHistory([
          entry({ orderNumber: 'TEN', productCount: 10 }),
          entry({ orderNumber: 'TWO', productCount: 2 }),
          entry({ orderNumber: 'ONE', productCount: 1 })
        ]);

        await click('history-sort-products');

        // Sorted as text, "10 product(s)" would come before "2 product(s)".
        expect(columnText(PRODUCTS)).toEqual(['1 product(s)', '2 product(s)', '10 product(s)']);
      });

      it('sorts the customer column alphabetically', async () => {
        await flushHistory([
          entry({ customer: 'zoe@fiftyflowers.com' }),
          entry({ customer: 'alice@fiftyflowers.com' })
        ]);

        await click('history-sort-customer');

        expect(columnText(CUSTOMER)).toEqual([
          'alice@fiftyflowers.com',
          'zoe@fiftyflowers.com'
        ]);
      });
    });

    describe('page size', () => {
      const entries = Array.from({ length: 30 }, (_, index) =>
        entry({
          orderNumber: `DEV-BB-${index + 1}`,
          date: `2026-01-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`
        })
      );

      it('renders the default page of 25 rows', async () => {
        await flushHistory(entries);

        expect(rows().length).toBe(25);
      });

      it('changes how many rows render', async () => {
        await flushHistory(entries);
        await choose('history-page-size', '10');

        expect(rows().length).toBe(10);
        expect(query('[data-testid="history-count"]').textContent?.trim()).toBe(
          'Showing 1-10 of 30'
        );
      });

      it('pages through the rest', async () => {
        await flushHistory(entries);
        await choose('history-page-size', '10');
        await click('history-next');

        expect(rows().length).toBe(10);
        expect(query('[data-testid="history-count"]').textContent?.trim()).toBe(
          'Showing 11-20 of 30'
        );
      });
    });

    describe('the per-entry product list', () => {
      it('keeps every product in the count cell tooltip', async () => {
        await flushHistory([entry({ productCount: 2 })]);

        const tooltip = rows()[0]
          .querySelectorAll('[role="cell"]')
          [PRODUCTS].querySelector('[title]') as HTMLElement;

        expect(cellText(0, PRODUCTS)).toBe('2 product(s)');
        expect(tooltip.title).toBe('product-1 × 1 — 1 bunches\nproduct-2 × 2 — 2 bunches');
      });
    });

    describe('an entry with no captured order number', () => {
      const entries = [
        entry({ orderNumber: null, date: '2026-05-05T10:00:00.000Z' }),
        entry({ orderNumber: 'DEV-BB-50F2328', date: '2026-06-05T10:00:00.000Z' })
      ];

      it('renders its placeholder in the order column', async () => {
        await flushHistory(entries);

        expect(columnText(ORDER)).toEqual(['#DEV-BB-50F2328', 'order number not captured']);
      });

      it('does not break sorting by order number', async () => {
        await flushHistory(entries);

        await click('history-sort-orderNumber');
        expect(columnText(ORDER)).toEqual(['order number not captured', '#DEV-BB-50F2328']);

        await click('history-sort-orderNumber');
        expect(columnText(ORDER)).toEqual(['#DEV-BB-50F2328', 'order number not captured']);
      });

      it('does not break sorting by date', async () => {
        await flushHistory(entries);
        await click('history-sort-date');

        expect(columnText(ORDER)).toEqual(['order number not captured', '#DEV-BB-50F2328']);
      });

      it('is excluded by a search it does not match, without matching "null"', async () => {
        await flushHistory(entries);

        await type('50F2328');
        expect(columnText(ORDER)).toEqual(['#DEV-BB-50F2328']);

        await type('null');
        expect(rows().length).toBe(0);
      });

      it('still matches a search on its customer', async () => {
        await flushHistory(entries);
        await type('jose@');

        expect(rows().length).toBe(2);
      });
    });

    describe('empty states', () => {
      it('shows the no-history state when nothing has ever run', async () => {
        await flushHistory([]);

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('No orders placed yet');
        expect(text).not.toContain('No results found');
        expect(fixture.nativeElement.querySelector('ui-data-table')).toBeNull();
      });

      it('shows the no-results state when a search excludes every row', async () => {
        await flushHistory([entry()]);
        await type('nothing matches this');

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(query('[data-testid="history-empty"]').textContent?.trim()).toBe('No results found');
        expect(text).not.toContain('No orders placed yet');
      });

      it('shows the no-results state when the filter and the search overlap to nothing', async () => {
        // The filter select only offers values the data actually has, so an
        // empty result needs a search the remaining environment cannot match.
        await flushHistory([
          entry({ orderNumber: 'DEV-1', environment: 'dev' }),
          entry({ orderNumber: 'STG-1', environment: 'staging' })
        ]);

        await choose('history-filter-environment', 'Staging');
        expect(columnText(ORDER)).toEqual(['#STG-1']);

        await type('DEV-1');

        expect(rows().length).toBe(0);
        expect(query('[data-testid="history-empty"]').textContent?.trim()).toBe('No results found');
      });
    });

    describe('searching by product', () => {
      // The old card list printed every product id in a bulleted list, so they were
      // findable with the browser's own find. Folding them into a count cell would
      // have lost that; searchAccessor keeps them reachable from the search box.
      it('finds an order by a product id that is never displayed', async () => {
        await flushHistory([
          { ...entry({ orderNumber: 'DEV-BB-1' }), products: [{ productId: 'peach-sorbet-diy-flower-kit', quantity: 1 }] },
          { ...entry({ orderNumber: 'DEV-BB-2' }), products: [{ productId: 'eskimo-white-rose', quantity: 2 }] }
        ]);

        await type('peach-sorbet');

        expect(rows().length).toBe(1);
        expect(rows()[0].textContent).toContain('DEV-BB-1');
      });

      it('finds an order by a product variant', async () => {
        await flushHistory([
          { ...entry({ orderNumber: 'DEV-BB-1' }), products: [{ productId: 'roses', quantity: 1, variant: '20 stems' }] },
          { ...entry({ orderNumber: 'DEV-BB-2' }), products: [{ productId: 'tulips', quantity: 1, variant: 'Medium Pack' }] }
        ]);

        await type('Medium Pack');

        expect(rows().length).toBe(1);
        expect(rows()[0].textContent).toContain('DEV-BB-2');
      });

      it('is case-insensitive over the hidden product text', async () => {
        await flushHistory([
          { ...entry({ orderNumber: 'DEV-BB-1' }), products: [{ productId: 'gunnii-eucalyptus-greens', quantity: 1 }] },
          { ...entry({ orderNumber: 'DEV-BB-2' }), products: [{ productId: 'roses', quantity: 1 }] }
        ]);

        await type('EUCALYPTUS');

        expect(rows().length).toBe(1);
      });

      it('shows the no-results state when no product matches', async () => {
        await flushHistory([entry({ orderNumber: 'DEV-BB-1' })]);

        await type('no-such-product-anywhere');

        expect(rows().length).toBe(0);
      });
    });

    describe('legacy junk order numbers', () => {
      /*
       * order-history.json still holds 476 entries written before the capture was
       * fixed: 362 read "Your order is confirmed", 32 "Finalize order", 22
       * "Order summary". Rendering "#Your order is confirmed" as an order number
       * is worse than admitting it was never captured.
       */
      it('renders the placeholder instead of a scraped heading', async () => {
        await flushHistory([entry({ orderNumber: 'Your order is confirmed' })]);

        expect(cellText(0, ORDER)).toContain('not captured');
        expect(cellText(0, ORDER)).not.toContain('#Your order is confirmed');
      });

      for (const junk of ['Order summary', 'Finalize order', 'Thank you']) {
        it(`rejects ${JSON.stringify(junk)}`, async () => {
          await flushHistory([entry({ orderNumber: junk })]);

          expect(cellText(0, ORDER)).toContain('not captured');
        });
      }

      it('keeps a real identifier', async () => {
        await flushHistory([entry({ orderNumber: 'DEV-BB-50F5089' })]);

        expect(cellText(0, ORDER)).toContain('DEV-BB-50F5089');
      });

      it('keeps a classic numeric order number when it says so', async () => {
        await flushHistory([entry({ orderNumber: 'Order #1234' })]);

        expect(cellText(0, ORDER)).toContain('1234');
      });

      it('rejects a bare #1234, which is also a valid 4-digit hex colour', async () => {
        // Ambiguous on its own, and every real number captured from this store has
        // been DEV-BB-shaped, so the word is required.
        await flushHistory([entry({ orderNumber: '#1234' })]);

        expect(cellText(0, ORDER)).toContain('not captured');
      });

      it('does not make junk findable by searching its text', async () => {
        await flushHistory([
          entry({ orderNumber: 'Your order is confirmed', customer: 'a@example.test' }),
          entry({ orderNumber: 'DEV-BB-1', customer: 'b@example.test' })
        ]);

        await type('confirmed');

        expect(rows().length).toBe(0);
      });
    });


    describe('a hex colour is not an order number', () => {
      /*
       * A real run captured "#303030" — a dark grey off the confirmation page — and
       * stored it as the order number. The reader rejects it, so the row shows the
       * placeholder rather than a colour.
       */
      it('shows the placeholder instead of a hex colour', async () => {
        await flushHistory([entry({ orderNumber: '303030' })]);

        expect(cellText(0, ORDER)).toContain('not captured');
      });

      it('still reads a real identifier', async () => {
        await flushHistory([entry({ orderNumber: 'DEV-BB-50F5137' })]);

        expect(cellText(0, ORDER)).toContain('DEV-BB-50F5137');
      });

      it('still reads a numeric number when the word order is present', async () => {
        await flushHistory([entry({ orderNumber: 'Order #1234' })]);

        expect(cellText(0, ORDER)).toContain('1234');
      });
    });

  });

});
