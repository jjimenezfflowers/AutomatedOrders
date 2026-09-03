import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  Input,
  TemplateRef,
  booleanAttribute,
  computed,
  contentChildren,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LucideAngularModule,
} from 'lucide-angular';

import {
  columnFacetingFeature,
  columnFilteringFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  injectTable,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/angular-table';

import { UiButtonComponent, UiInputComponent, UiSelectComponent, type UiSelectOption } from './';

/**
 * One column of a `<ui-data-table>`.
 *
 * `width` is a single `grid-template-columns` track: the table is rendered as CSS
 * grid rows (like the admin's tables in bb-remix), not as a `<table>`, so every
 * column contributes one track to the same template string.
 */
export interface UiDataTableColumn<T> {
  id: string;
  header: string;
  /** A grid-template-columns track, e.g. `minmax(200px,2fr)` or `120px`. */
  width: string;
  /** Value used for search, sorting, filtering, and as the default cell text. */
  accessor: (row: T) => string | number | null;
  /**
   * Extra text global search should match, when the displayed value is not what a
   * user would type. A cell showing "3 product(s)" wants to be findable by the
   * product names behind it, while sorting still uses the numeric accessor.
   */
  searchAccessor?: (row: T) => string;
  sortable?: boolean;
  /** Renders a select of this column's distinct values above the table. */
  filterable?: boolean;
  align?: 'left' | 'right';
}

/** Context handed to a caller-supplied cell template. */
export interface UiDataTableCellContext<T> {
  /** The row object, so a template can reach fields the accessor does not expose. */
  $implicit: T;
  /** What `accessor` returned for this cell — the same text the fallback renders. */
  value: string | number | null;
  columnId: string;
}

/**
 * Replaces the text of one column's cells.
 *
 *   <ui-data-table [data]="products()" [columns]="columns">
 *     <ng-template uiDataTableCell="status" let-product let-status="value">
 *       <ui-badge [variant]="product.active ? 'default' : 'outline'">{{ status }}</ui-badge>
 *     </ng-template>
 *   </ui-data-table>
 *
 * Columns without a template fall back to rendering the accessor's value.
 */
@Directive({
  selector: 'ng-template[uiDataTableCell]',
  standalone: true,
})
export class UiDataTableCellDirective {
  /** Id of the column whose cells this template renders. */
  @Input({ alias: 'uiDataTableCell', required: true }) columnId!: string;

  readonly template: TemplateRef<unknown> = inject(TemplateRef);
}

/*
 * TanStack Table v9 is modular: nothing is on by default, so every feature the
 * table uses has to be listed here along with the row-model builder that feeds
 * it. Built as a module constant because `injectTable`'s initializer re-runs on
 * every signal change and the feature set never does.
 *
 * The two function registries are deliberate rather than a spread of the full
 * `filterFns`/`sortFns` exports: `columnDef.filterFn`/`sortFn` resolve names
 * through these maps, and registering only what this table can pick keeps the
 * unused built-ins out of the bundle.
 */
const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnFacetingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filterFns: {
    equalsString: filterFn_equalsString,
    includesString: filterFn_includesString,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SKELETON_ROW_COUNT = 5;

/*
 * Class strings are the admin's (bb-remix app/shared/components/data-table.tsx),
 * with its hardcoded colours swapped for this app's tokens so the dark theme
 * toggle reaches them. Rows are 56px with a 1px bottom border and no zebra
 * striping, exactly as upstream.
 */
const ROW_CLASS =
  'grid h-14 items-center border-b bg-card hover:bg-muted ' +
  '[&>*]:max-h-full [&>*]:min-w-0 [&>*]:overflow-hidden';
const HEADER_ROW_CLASS = 'grid items-center border-b bg-card sticky top-0 z-10';
const HEADER_CELL_CLASS =
  'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground text-xs';
const BODY_CELL_CLASS = 'p-2 align-middle';
const EMPTY_CLASS =
  'grid w-full items-center p-4 text-sm font-normal text-muted-foreground sm:px-10';

/**
 * A searchable, filterable, sortable, paginated table.
 *
 * Rendered as CSS-grid rows rather than a `<table>` — column widths come from the
 * `width` track on each column — with the ARIA roles that restores the table
 * semantics a screen reader would otherwise lose.
 *
 * Every `data-testid` inside is prefixed with the `testId` input, so
 * `testId="products"` yields `products-search`, `products-row`, `products-next`
 * and so on.
 */
@Component({
  selector: 'ui-data-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    LucideAngularModule,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
  ],
  template: `
    <div class="flex w-full flex-col gap-3" [attr.data-testid]="testId()">
      <div class="flex flex-wrap items-center gap-2">
        <ui-input
          class="w-full sm:max-w-xs"
          type="text"
          [placeholder]="searchPlaceholder()"
          [testId]="scopedTestId('search')"
          [ngModel]="searchValue()"
          (ngModelChange)="onSearchChange($event)"
        />

        @for (column of filterableColumns(); track column.id) {
          <!-- A dropdown whose only option is "All" narrows nothing; skip it. -->
          @if (filterOptions(column.id).length > 1) {
            <ui-select
              size="sm"
              class="w-auto min-w-40"
              [options]="filterOptions(column.id)"
              [placeholder]="'All ' + column.header"
              [testId]="scopedTestId('filter-' + column.id)"
              [ngModel]="filterValue(column.id)"
              (ngModelChange)="onFilterChange(column.id, $event)"
            />
          }
        }
      </div>

      <div class="relative w-full overflow-x-auto">
        <div role="table" class="flex w-full flex-col" [attr.aria-rowcount]="totalRows() + 1">
          <div
            role="row"
            [class]="headerRowClass"
            [style.grid-template-columns]="gridTemplate()"
          >
            @for (header of headerCells(); track header.id) {
              <div
                role="columnheader"
                [class]="headerCellClass"
                [class.text-right]="header.align === 'right'"
                [attr.aria-sort]="header.ariaSort"
              >
                @if (header.sortable) {
                  <ui-button
                    variant="ghost"
                    size="xs"
                    class="-mx-2 h-8 gap-1 text-xs font-medium"
                    [class.ml-auto]="header.align === 'right'"
                    [testId]="scopedTestId('sort-' + header.id)"
                    (click)="toggleSort(header.id)"
                  >
                    {{ header.label }}
                    <lucide-angular [img]="header.icon" class="size-3.5" aria-hidden="true" />
                  </ui-button>
                } @else {
                  {{ header.label }}
                }
              </div>
            }
          </div>

          <div class="flex w-full flex-col">
            @if (loading()) {
              @for (skeleton of skeletonRows; track $index) {
                <div
                  aria-hidden="true"
                  [class]="rowClass"
                  [style.grid-template-columns]="gridTemplate()"
                  [attr.data-testid]="scopedTestId('skeleton-row')"
                >
                  @for (column of columns(); track column.id) {
                    <div [class]="bodyCellClass">
                      <div class="h-4 w-2/3 animate-pulse rounded-md bg-muted"></div>
                    </div>
                  }
                </div>
              }
            } @else if (bodyRows().length === 0) {
              <div [class]="emptyClass" [attr.data-testid]="scopedTestId('empty')">
                {{ resolvedEmptyMessage() }}
              </div>
            } @else {
              @for (row of bodyRows(); track row.id) {
                <div
                  role="row"
                  [class]="rowClass"
                  [style.grid-template-columns]="gridTemplate()"
                  [attr.data-testid]="scopedTestId('row')"
                >
                  @for (cell of row.cells; track cell.id) {
                    <div
                      role="cell"
                      [class]="bodyCellClass"
                      [class.text-right]="cell.align === 'right'"
                    >
                      @if (cellTemplate(cell.columnId); as template) {
                        <ng-container
                          [ngTemplateOutlet]="template"
                          [ngTemplateOutletContext]="{
                            $implicit: row.data,
                            value: cell.value,
                            columnId: cell.columnId,
                          }"
                        />
                      } @else {
                        {{ cell.value }}
                      }
                    </div>
                  }
                </div>
              }
            }
          </div>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground"
      >
        <span [attr.data-testid]="scopedTestId('count')">{{ countLabel() }}</span>

        <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <label class="flex items-center gap-2 text-xs">
            <span>Rows per page</span>
            <ui-select
              size="sm"
              class="w-auto"
              [options]="pageSizeSelectOptions()"
              [testId]="scopedTestId('page-size')"
              [ngModel]="pageSizeValue()"
              (ngModelChange)="onPageSizeChange($event)"
            />
          </label>

          <span class="text-xs" [attr.data-testid]="scopedTestId('page-label')">
            Page {{ pageNumber() }} of {{ pageCount() }}
          </span>

          <div class="flex items-center gap-1">
            <ui-button
              variant="outline"
              size="sm"
              [disabled]="!canPreviousPage()"
              [testId]="scopedTestId('previous')"
              (click)="previousPage()"
            >
              <lucide-angular [img]="previousIcon" class="size-3.5" aria-hidden="true" />
              Previous
            </ui-button>
            <ui-button
              variant="outline"
              size="sm"
              [disabled]="!canNextPage()"
              [testId]="scopedTestId('next')"
              (click)="nextPage()"
            >
              Next
              <lucide-angular [img]="nextIcon" class="size-3.5" aria-hidden="true" />
            </ui-button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class UiDataTableComponent<T extends RowData> {
  readonly data = input<readonly T[]>([]);
  readonly columns = input<readonly UiDataTableColumn<T>[]>([]);
  readonly loading = input(false, { transform: booleanAttribute });
  readonly searchPlaceholder = input('Search...');
  /** Shown when `data` itself is empty; a filter that excludes every row always says "No results found". */
  readonly emptyMessage = input('No results found');
  readonly pageSizeOptions = input<readonly number[]>(DEFAULT_PAGE_SIZE_OPTIONS);
  readonly initialPageSize = input(25);
  /** Prefix for every `data-testid` this component renders. */
  readonly testId = input('ui-data-table');

  private readonly cellTemplates = contentChildren(UiDataTableCellDirective);

  protected readonly headerRowClass = HEADER_ROW_CLASS;
  protected readonly headerCellClass = HEADER_CELL_CLASS;
  protected readonly rowClass = ROW_CLASS;
  protected readonly bodyCellClass = BODY_CELL_CLASS;
  protected readonly emptyClass = EMPTY_CLASS;
  protected readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });
  protected readonly previousIcon = ChevronLeft;
  protected readonly nextIcon = ChevronRight;

  private readonly columnsById = computed(
    () => new Map(this.columns().map((column) => [column.id, column])),
  );

  /*
   * `filterFn` is pinned to `equalsString` on every column, not only the
   * filterable ones: the per-column control is a select of exact values, and the
   * default `'auto'` would resolve numeric columns to `inNumberRange`, which is
   * not in this table's registry and warns in dev. Non-filterable columns never
   * receive a filter value, so pinning it costs nothing.
   */
  private readonly columnDefs = computed<ColumnDef<typeof dataTableFeatures, T>[]>(() =>
    this.columns().map((column) => ({
      id: column.id,
      header: column.header,
      accessorFn: (row: T) => column.accessor(row),
      enableSorting: column.sortable ?? false,
      enableColumnFilter: column.filterable ?? false,
      filterFn: 'equalsString',
    })),
  );

  /*
   * Only `data()` and the column definitions are read here. Sorting, filtering
   * and pagination live in the table's own state, so changing them updates the
   * existing instance instead of re-running this initializer.
   */
  private readonly table = injectTable<typeof dataTableFeatures, T>(() => ({
    features: dataTableFeatures,
    data: this.data() as T[],
    columns: this.columnDefs(),
    initialState: { pagination: { pageIndex: 0, pageSize: this.initialPageSize() } },
    // TanStack picks the first sort direction from the column's value type, which
    // would make numeric columns start descending. One rule for every column is
    // less surprising: first click ascending, second descending, third unsorted.
    sortDescFirst: false,
    enableSortingRemoval: true,
    globalFilterFn: this.matchesSearch,
  }));

  /*
   * Global search runs over the whole row rather than one column at a time, so a
   * column can display one thing and still be found by another: History shows
   * "3 product(s)" but is searchable by the product ids behind that count.
   *
   * TanStack calls this once per globally-filterable column; the row is included
   * if any call returns true, so ignoring columnId and testing the row once gives
   * the same result.
   */
  private readonly matchesSearch = (row: { original: T }, _columnId: string, filterValue: unknown) => {
    const term = String(filterValue ?? '').trim().toLowerCase();
    if (!term) return true;

    return this.columns().some((column) => {
      const value = column.accessor(row.original);
      const extra = column.searchAccessor?.(row.original) ?? '';
      return `${value ?? ''} ${extra}`.toLowerCase().includes(term);
    });
  };

  protected readonly gridTemplate = computed(() =>
    this.columns()
      .map((column) => column.width)
      .join(' '),
  );

  protected readonly filterableColumns = computed(() =>
    this.columns().filter((column) => column.filterable),
  );

  protected readonly headerCells = computed(() => {
    const byId = this.columnsById();

    return (this.table.getHeaderGroups()[0]?.headers ?? []).map((header) => {
      const definition = byId.get(header.column.id);
      const sortable = header.column.getCanSort();
      const sorted = header.column.getIsSorted();

      return {
        id: header.column.id,
        label: definition?.header ?? header.column.id,
        align: definition?.align ?? 'left',
        sortable,
        icon: sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown,
        ariaSort: sortable
          ? sorted === 'asc'
            ? 'ascending'
            : sorted === 'desc'
              ? 'descending'
              : 'none'
          : null,
      };
    });
  });

  protected readonly bodyRows = computed(() => {
    const byId = this.columnsById();

    return this.table.getRowModel().rows.map((row) => ({
      id: row.id,
      data: row.original,
      cells: row.getAllCells().map((cell) => ({
        id: cell.id,
        columnId: cell.column.id,
        value: cell.getValue() as string | number | null,
        align: byId.get(cell.column.id)?.align ?? 'left',
      })),
    }));
  });

  protected readonly searchValue = computed(() =>
    String(this.table.atoms.globalFilter?.get() ?? ''),
  );

  /** Rows left after search and column filters, i.e. everything pagination pages through. */
  protected readonly totalRows = computed(() => this.table.getRowCount());

  protected readonly pageCount = computed(() => Math.max(1, this.table.getPageCount()));

  protected readonly pageNumber = computed(
    () => (this.table.atoms.pagination?.get().pageIndex ?? 0) + 1,
  );

  protected readonly pageSizeValue = computed(() =>
    String(this.table.atoms.pagination?.get().pageSize ?? this.initialPageSize()),
  );

  protected readonly canPreviousPage = computed(() => this.table.getCanPreviousPage());

  protected readonly canNextPage = computed(() => this.table.getCanNextPage());

  protected readonly pageSizeSelectOptions = computed<UiSelectOption[]>(() =>
    this.pageSizeOptions().map((size) => ({ value: String(size), label: String(size) })),
  );

  protected readonly countLabel = computed(() => {
    const total = this.totalRows();
    if (total === 0) {
      return 'Showing 0 of 0';
    }

    const onPage = this.bodyRows().length;
    const first = (this.pageNumber() - 1) * Number(this.pageSizeValue()) + 1;
    return `Showing ${first}-${first + onPage - 1} of ${total}`;
  });

  protected readonly resolvedEmptyMessage = computed(() =>
    this.data().length === 0 ? this.emptyMessage() : 'No results found',
  );

  /* Recomputed as one map so each select keeps a stable options array reference. */
  private readonly filterOptionsById = computed(() => {
    const options = new Map<string, UiSelectOption[]>();

    for (const column of this.filterableColumns()) {
      const tableColumn = this.table.getColumn(column.id);
      if (!tableColumn) {
        continue;
      }

      const values = [...tableColumn.getFacetedUniqueValues().keys()]
        .filter((value): value is string | number => value !== null && value !== undefined && value !== '')
        .map((value) => String(value));

      // The facets exclude rows the search has already removed, so a value that is
      // currently selected can vanish from the list while it is still applied.
      const selected = this.filterValue(column.id);
      if (selected && !values.includes(selected)) {
        values.push(selected);
      }

      values.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      options.set(
        column.id,
        values.map((value) => ({ value, label: value })),
      );
    }

    return options;
  });

  protected scopedTestId(suffix: string): string {
    return `${this.testId()}-${suffix}`;
  }

  protected filterOptions(columnId: string): UiSelectOption[] {
    return this.filterOptionsById().get(columnId) ?? [];
  }

  protected filterValue(columnId: string): string {
    return String(this.table.getColumn(columnId)?.getFilterValue() ?? '');
  }

  protected cellTemplate(columnId: string): TemplateRef<unknown> | undefined {
    return this.cellTemplates().find((cell) => cell.columnId === columnId)?.template;
  }

  protected onSearchChange(value: string | number | null): void {
    this.table.setGlobalFilter(value == null ? '' : String(value));
  }

  protected onFilterChange(columnId: string, value: string): void {
    this.table.getColumn(columnId)?.setFilterValue(value);
  }

  protected onPageSizeChange(value: string): void {
    this.table.setPageSize(Number(value));
  }

  protected toggleSort(columnId: string): void {
    this.table.getColumn(columnId)?.toggleSorting();
  }

  protected previousPage(): void {
    this.table.previousPage();
  }

  protected nextPage(): void {
    this.table.nextPage();
  }
}
