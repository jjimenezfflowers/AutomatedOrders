import { Component, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, History, ExternalLink } from 'lucide-angular';

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
  deliveryDate?: string;
}

/** A line the store actually charged for, as opposed to one the run asked for. */
interface HistoryLineItem {
  title: string;
  quantity: number;
  variant?: string;
  sku?: string;
  unitPrice?: string;
}

interface HistoryEntry {
  // Null when the confirmation page did not expose a usable order number; the
  // order was still placed, so the entry is kept rather than dropped.
  orderNumber: string | null;
  // Shopify's own confirmation reference, which only entries captured through the
  // Admin API carry — the confirmation page never exposed it to scraping.
  confirmationNumber?: string | null;
  date: string;
  environment?: 'dev' | 'staging';
  products: HistoryProduct[];
  customer: string;
  total: string;
  // Everything below arrives from the Admin API, so it is absent on every entry
  // written before that integration. The table renders those as blank rather
  // than inventing a value.
  adminUrl?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  destination?: string | null;
  shippingMethod?: string | null;
  subtotal?: string | null;
  shipping?: string | null;
  tax?: string | null;
  discounts?: string | null;
  lineItems?: HistoryLineItem[];
}

/*
 * Delivery date is per product, and an order can span more than one (3 of the 476
 * do). The earliest is what the order is scheduled for; the cell says "+N more"
 * when they differ so the spread is visible rather than silently dropped.
 */
function deliveryDates(entry: HistoryEntry): string[] {
  return [...new Set(entry.products.map((p) => p.deliveryDate).filter(Boolean) as string[])].sort();
}

function earliestDelivery(entry: HistoryEntry): string {
  return deliveryDates(entry)[0] ?? '';
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
 * confirmation page's heading said. Most are useless — 362 read "Your order is
 * confirmed", 32 "Finalize order", 22 "Order summary" — but 59 of them read
 * "Your order number is: DEV-BB-50F2327" and do carry the real number.
 *
 * So this extracts rather than validates. An earlier version tested the whole
 * string against the identifier shape, which is anchored, so every one of those
 * 59 failed and rendered as "not captured" — throwing away information the file
 * actually had.
 *
 * Same patterns as tests/helpers/order-number.js, which decides what gets written.
 */
const ORDER_NUMBER_PATTERNS = [
  // Environment-prefixed identifiers, e.g. DEV-BB-50F2327 / STAGE-BB-1204.
  /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/,
  /*
   * Classic Shopify order numbers, e.g. "Order #1234". The word is required: a
   * bare /#\d{3,}/ also matches a hex colour like #303030.
   */
  /\border\s*#\s*(\d{3,})\b/i,
];

function usableOrderNumber(value: string | null): string | null {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  for (const pattern of ORDER_NUMBER_PATTERNS) {
    const match = text.match(pattern);
    // An order number always carries a digit; this rejects tokens like "SHOP-NOW".
    if (match && /\d/.test(match[1])) return match[1];
  }

  return null;
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
  readonly icons = { history: History, external: ExternalLink };

  /** The order's delivery date, and how many other dates it spans. */
  deliverySummary(entry: HistoryEntry): { first: string; extra: number } {
    const dates = deliveryDates(entry);
    return { first: dates[0] ?? '', extra: Math.max(0, dates.length - 1) };
  }

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
      id: 'confirmationNumber',
      header: 'Confirmation',
      width: 'minmax(150px,1fr)',
      // Blank for every entry written before the API integration; those orders
      // are real, they just have no reference recorded.
      accessor: (entry) => entry.confirmationNumber ?? '',
      sortable: true,
    },
    {
      id: 'status',
      header: 'Status',
      width: 'minmax(150px,1fr)',
      // Sorts and searches on both statuses at once, so "unfulfilled" finds the
      // runs waiting on the store.
      accessor: (entry) =>
        [entry.financialStatus, entry.fulfillmentStatus].filter(Boolean).join(' ').toLowerCase(),
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
      id: 'delivery',
      header: 'Delivery',
      width: 'minmax(150px,1fr)',
      // Sorts on the raw ISO date, like the placed-at column, so August orders
      // before September rather than after it.
      accessor: (entry) => earliestDelivery(entry),
      sortable: true,
    },
    {
      id: 'customer',
      header: 'Customer',
      width: 'minmax(200px,1.5fr)',
      accessor: (entry) => entry.customer,
      sortable: true,
      // Not filterable: every entry in the file carries the same address, so the
      // dropdown would offer exactly one option.
    },
    {
      id: 'total',
      header: 'Total',
      width: '130px',
      // Not sortable: 479 of the 480 entries read 'N/A', because a total could
      // never be read off a page whose browser had already closed. Sorting a
      // column that is almost entirely one placeholder invites reading meaning
      // into the order it produces.
      accessor: (entry) => (entry.total && entry.total !== 'N/A' ? entry.total : '—'),
      align: 'right',
    },
    {
      id: 'admin',
      header: 'Admin',
      width: '110px',
      // Nothing to sort or search on; the cell is a link, and its text would
      // just repeat the order number.
      accessor: () => '',
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

  /** PARTIALLY_REFUNDED reads as "Partially refunded". */
  humanise(status: string | null | undefined): string {
    if (!status) return '';
    const words = status.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  financialTone(entry: HistoryEntry): 'success' | 'warning' | 'destructive' | 'secondary' {
    switch (entry.financialStatus) {
      case 'PAID':
        return 'success';
      case 'REFUNDED':
      case 'VOIDED':
        return 'destructive';
      case 'PENDING':
      case 'PARTIALLY_PAID':
      case 'PARTIALLY_REFUNDED':
        return 'warning';
      default:
        return 'secondary';
    }
  }

  /**
   * The money breakdown, for the total cell's tooltip.
   *
   * A column per line would push the table past the width it has; the breakdown is
   * worth keeping, so it lives one hover away rather than being dropped.
   */
  totalBreakdown(entry: HistoryEntry): string {
    const rows: [string, string | null | undefined][] = [
      ['Subtotal', entry.subtotal],
      ['Discounts', entry.discounts],
      [entry.shippingMethod ? `Shipping (${entry.shippingMethod})` : 'Shipping', entry.shipping],
      ['Tax', entry.tax],
      ['Total', entry.total !== 'N/A' ? entry.total : null],
    ];
    const lines = rows.filter(([, value]) => Boolean(value));

    if (!lines.length) return 'No breakdown recorded for this run.';

    const destination = entry.destination ? `\nShips to ${entry.destination}` : '';
    return lines.map(([label, value]) => `${label}: ${value}`).join('\n') + destination;
  }

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
  /*
   * Prefers what the store charged for over what the run asked for. The config
   * only knows a product's slug; the store knows its name, its SKU and what it
   * cost, which is what someone checking a run is actually after.
   */
  productSummary(entry: HistoryEntry): string {
    if (entry.lineItems?.length) {
      return entry.lineItems
        .map((item) => {
          const variant = item.variant ? ` - ${item.variant}` : '';
          const sku = item.sku ? ` [${item.sku}]` : '';
          const price = item.unitPrice ? ` @ ${item.unitPrice}` : '';
          return `${item.title} × ${item.quantity}${variant}${sku}${price}`;
        })
        .join('\n');
    }

    return entry.products
      .map(p => `${p.productId} × ${p.quantity}${p.variant ? ' - ' + p.variant : ''}`)
      .join('\n');
  }
}
