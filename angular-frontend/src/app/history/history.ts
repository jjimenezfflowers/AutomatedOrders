import { Component, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, History } from 'lucide-angular';

import {
  UI_CARD,
  UiBadgeComponent,
  UiDataTableCellDirective,
  UiDataTableComponent,
  type UiDataTableColumn,
} from '../ui';

interface HistoryProduct {
  productId: string;
  quantity: number;
  variant?: string;
}

interface HistoryEntry {
  // Null when the confirmation page did not expose a usable order number; the
  // order was still placed, so the entry is kept rather than dropped.
  orderNumber: string | null;
  date: string;
  environment?: 'dev' | 'staging';
  products: HistoryProduct[];
  customer: string;
  total: string;
}

/** Entries written before the staging runs existed carry no environment; they were all dev. */
function environmentLabel(entry: HistoryEntry): string {
  return entry.environment === 'staging' ? 'Staging' : 'DEV';
}

/** Epoch millis, with unparseable dates pushed to the oldest end rather than poisoning the sort. */
function timestamp(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/*
 * Entries written before the order-number capture was fixed stored whatever the
 * confirmation page's heading said — 362 of them read "Your order is confirmed",
 * 32 "Finalize order", 22 "Order summary". Rendering those as "#Your order is
 * confirmed" is worse than admitting the number was never captured, so anything
 * that is not shaped like an identifier is treated as missing.
 *
 * Same rule as tests/helpers/order-number.js, which decides what gets written.
 */
const ORDER_NUMBER_PATTERN = /^#?[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$|^#?\d{3,}$/;

function usableOrderNumber(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed || !ORDER_NUMBER_PATTERN.test(trimmed)) return null;
  return /\d/.test(trimmed) ? trimmed : null;
}

@Component({
  selector: 'app-history',
  imports: [
    LucideAngularModule,
    ...UI_CARD,
    UiBadgeComponent,
    UiDataTableComponent,
    UiDataTableCellDirective,
  ],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class HistoryComponent implements OnInit {
  readonly history = signal<HistoryEntry[]>([]);
  readonly loading = signal(true);
  readonly icons = { history: History };

  /*
   * The date column's accessor hands the table the raw ISO string, not what the
   * cell displays: the formatted date sorts by month name ("Sep" before "Aug")
   * and by the first digit of the day ("9/10" before "9/2"). ISO strings are
   * fixed-width and zero-padded, so their lexicographic order is chronological.
   *
   * The per-entry product list is too tall for a 56px row, so it is folded into
   * the count cell's `title` — nothing is dropped, it is one hover away.
   */
  readonly columns: UiDataTableColumn<HistoryEntry>[] = [
    {
      id: 'orderNumber',
      header: 'Order',
      width: 'minmax(220px,2fr)',
      // '' rather than null so a missing number searches and sorts as empty text
      // instead of stringifying to "null".
      accessor: (entry) => entry.orderNumber ?? '',
      sortable: true,
    },
    {
      id: 'environment',
      header: 'Environment',
      width: '150px',
      accessor: environmentLabel,
      filterable: true,
    },
    {
      id: 'date',
      header: 'Date',
      width: 'minmax(200px,1fr)',
      accessor: (entry) => entry.date,
      sortable: true,
    },
    {
      id: 'customer',
      header: 'Customer',
      width: 'minmax(220px,1.5fr)',
      accessor: (entry) => entry.customer,
      sortable: true,
      filterable: true,
    },
    {
      id: 'products',
      header: 'Products',
      width: '130px',
      accessor: (entry) => entry.products.length,
      // The cell shows a count, but the products behind it are what someone
      // actually searches for. Sorting still uses the numeric accessor.
      searchAccessor: (entry) =>
        entry.products.map((p) => `${p.productId} ${p.variant ?? ''}`).join(' '),
      sortable: true,
      align: 'right',
    },
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<HistoryEntry[]>('/api/order-history').subscribe({
      next: data => {
        // Newest first: the file appends, so its own order is oldest first, and
        // whoever opens this page is looking for the run that just finished.
        this.history.set(
          [...data]
            .map((entry) => ({ ...entry, orderNumber: usableOrderNumber(entry.orderNumber) }))
            .sort((a, b) => timestamp(b.date) - timestamp(a.date)),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  /** The products of one entry, one per line, for the count cell's tooltip. */
  productSummary(entry: HistoryEntry): string {
    return entry.products
      .map(p => `${p.productId} × ${p.quantity}${p.variant ? ' — ' + p.variant : ''}`)
      .join('\n');
  }
}
