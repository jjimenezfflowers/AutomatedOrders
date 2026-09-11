import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ExternalLink, CircleCheck, CircleAlert } from 'lucide-angular';

import {
  UiBadgeComponent,
  UiCardComponent,
  UiCardContentComponent,
  UiCardHeaderComponent,
  UiCardTitleComponent,
  BadgeVariant,
} from '../ui';

/** One line of what the store charged for. */
export interface PlacedOrderLineItem {
  title: string;
  quantity: number;
  variant?: string;
  sku?: string;
  unitPrice?: string;
  image?: string;
}

/**
 * What a finished run placed, as the store reports it.
 *
 * Every field is optional: an entry written before the Admin API integration has
 * only a number and a date, and the panel has to render that without inventing
 * the rest.
 */
export interface PlacedOrder {
  orderNumber: string | null;
  confirmationNumber?: string | null;
  orderId?: string | null;
  adminUrl?: string | null;
  statusUrl?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  destination?: string | null;
  shippingMethod?: string | null;
  subtotal?: string | null;
  shipping?: string | null;
  tax?: string | null;
  discounts?: string | null;
  total?: string | null;
  tags?: string[];
  lineItems?: PlacedOrderLineItem[];
  matchedBy?: string | null;
  source?: string | null;
}

/** Empty values read as a dash, the same as they do in the tables. */
const EMPTY = '—';

/*
 * Shopify's statuses arrive as PAID / PARTIALLY_REFUNDED / UNFULFILLED. Rather than
 * map every possible value, only the ones worth colouring are listed; anything else
 * renders neutral, which is the honest treatment for a status this app has no
 * opinion about.
 */
const FINANCIAL_TONE: Record<string, BadgeVariant> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  PENDING: 'warning',
  REFUNDED: 'destructive',
  PARTIALLY_REFUNDED: 'warning',
  VOIDED: 'destructive',
};

const FULFILLMENT_TONE: Record<string, BadgeVariant> = {
  FULFILLED: 'success',
  PARTIALLY_FULFILLED: 'warning',
  UNFULFILLED: 'secondary',
};

/*
 * Runs used to report themselves through a native alert() that said only "the test
 * completed without errors" and then vanished. It could not say what was placed,
 * because nothing was captured; now the store answers, so the result is worth
 * keeping on screen.
 */
@Component({
  selector: 'order-result',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    UiBadgeComponent,
    UiCardComponent,
    UiCardContentComponent,
    UiCardHeaderComponent,
    UiCardTitleComponent,
  ],
  template: `
    @if (error) {
      <ui-card class="border-destructive/30" data-testid="order-result-error">
        <ui-card-header>
          <ui-card-title class="flex items-center gap-2 text-destructive">
            <lucide-angular [img]="icons.failed" class="size-4" aria-hidden="true" />
            Order could not be placed
          </ui-card-title>
        </ui-card-header>
        <ui-card-content>
          <pre
            class="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground"
            data-testid="order-result-error-output"
            >{{ error }}</pre
          >
          <p class="pt-3 text-sm text-muted-foreground">
            The full run output is on the Logs page.
          </p>
        </ui-card-content>
      </ui-card>
    } @else if (order) {
      <ui-card data-testid="order-result">
        <ui-card-header>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1">
              <ui-card-title class="flex items-center gap-2">
                <lucide-angular
                  [img]="icons.placed"
                  class="size-4 text-success"
                  aria-hidden="true"
                />
                <span data-testid="order-result-number">{{ order.orderNumber ?? EMPTY }}</span>
              </ui-card-title>
              <p class="text-sm text-muted-foreground">
                Confirmation
                <span class="font-mono text-foreground" data-testid="order-result-confirmation">{{
                  order.confirmationNumber ?? EMPTY
                }}</span>
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              @if (order.financialStatus) {
                <ui-badge [variant]="financialTone" data-testid="order-result-financial">
                  {{ humanise(order.financialStatus) }}
                </ui-badge>
              }
              @if (order.fulfillmentStatus) {
                <ui-badge [variant]="fulfillmentTone" data-testid="order-result-fulfillment">
                  {{ humanise(order.fulfillmentStatus) }}
                </ui-badge>
              }
              @if (order.adminUrl) {
                <a
                  [href]="order.adminUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="order-result-admin-link"
                >
                  <lucide-angular [img]="icons.external" class="size-3.5" aria-hidden="true" />
                  Shopify Admin
                </a>
              }
            </div>
          </div>
        </ui-card-header>

        <ui-card-content class="space-y-6">
          <!-- What was charged for -->
          @if (order.lineItems?.length) {
            <ul class="divide-y divide-border" data-testid="order-result-items">
              @for (item of order.lineItems; track item.title + item.variant) {
                <li class="flex items-center gap-3 py-3 first:pt-0">
                  @if (item.image) {
                    <img
                      [src]="item.image"
                      alt=""
                      class="size-10 shrink-0 rounded-md border border-border object-cover"
                      loading="lazy"
                    />
                  }
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-foreground">{{ item.title }}</p>
                    <p class="truncate text-xs text-muted-foreground">
                      {{ item.variant ?? EMPTY }}
                      @if (item.sku) {
                        <span class="font-mono"> · {{ item.sku }}</span>
                      }
                    </p>
                  </div>
                  <p class="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {{ item.quantity }} ×
                  </p>
                  <p class="w-28 shrink-0 text-right text-sm tabular-nums text-foreground">
                    {{ item.unitPrice ?? EMPTY }}
                  </p>
                </li>
              }
            </ul>
          }

          <!-- What it cost -->
          <dl class="space-y-2 text-sm" data-testid="order-result-totals">
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground">Subtotal</dt>
              <dd class="tabular-nums text-foreground">{{ order.subtotal ?? EMPTY }}</dd>
            </div>
            @if (order.discounts && order.discounts !== '0.00 USD') {
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground">Discounts</dt>
                <dd class="tabular-nums text-foreground">{{ order.discounts }}</dd>
              </div>
            }
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground">
                Shipping
                @if (order.shippingMethod) {
                  <span class="text-xs">({{ order.shippingMethod }})</span>
                }
              </dt>
              <dd class="tabular-nums text-foreground">{{ order.shipping ?? EMPTY }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground">Tax</dt>
              <dd class="tabular-nums text-foreground">{{ order.tax ?? EMPTY }}</dd>
            </div>
            <div
              class="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold"
            >
              <dt class="text-foreground">Total</dt>
              <dd class="tabular-nums text-foreground" data-testid="order-result-total">
                {{ order.total ?? EMPTY }}
              </dd>
            </div>
          </dl>

          <!-- Where it went, and how confidently it was identified -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p class="text-sm text-muted-foreground">
              Ships to
              <span class="text-foreground">{{ order.destination ?? EMPTY }}</span>
            </p>
            @if (provenance) {
              <p class="text-xs text-muted-foreground" data-testid="order-result-provenance">
                {{ provenance }}
              </p>
            }
          </div>
        </ui-card-content>
      </ui-card>
    }
  `,
})
export class OrderResultComponent {
  /** The order a run just placed, or null before any run has finished. */
  @Input() order: PlacedOrder | null = null;

  /** Run output when the run failed, shown instead of the order. */
  @Input() error: string | null = null;

  protected readonly EMPTY = EMPTY;

  protected readonly icons = {
    placed: CircleCheck,
    failed: CircleAlert,
    external: ExternalLink,
  };

  protected get financialTone(): BadgeVariant {
    return FINANCIAL_TONE[this.order?.financialStatus ?? ''] ?? 'secondary';
  }

  protected get fulfillmentTone(): BadgeVariant {
    return FULFILLMENT_TONE[this.order?.fulfillmentStatus ?? ''] ?? 'secondary';
  }

  /** PARTIALLY_REFUNDED reads as "Partially refunded". */
  protected humanise(status: string): string {
    const words = status.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * How the order was identified.
   *
   * Worth showing: a run matched by its cart token is certain, while one matched
   * only by being the most recent order is a guess, and the difference should not
   * be invisible to whoever reads the result.
   */
  protected get provenance(): string | null {
    if (this.order?.source === 'page') return 'Read from the confirmation page';

    switch (this.order?.matchedBy) {
      case 'cartToken':
        return 'Matched by cart token';
      case 'orderStatusToken':
        return 'Matched by order status link';
      case 'productsAndTime':
        return 'Matched by products and time';
      case 'mostRecent':
        return 'Most recent order in the store, not an exact match';
      default:
        return null;
    }
  }
}
