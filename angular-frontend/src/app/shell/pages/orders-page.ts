import { Component, computed, inject, viewChild } from '@angular/core';
import { LucideAngularModule, Play } from 'lucide-angular';

import { OrdersComponent } from '../../orders/orders';
import { StagingOrdersComponent } from '../../staging-orders/staging-orders';
import { UiButtonComponent, UiPageComponent } from '../../ui';
import { EnvironmentService } from '../environment.service';
import { SECTION_COPY } from '../navigation';

/**
 * Orders is environment-scoped, and unlike Products the two environments are
 * different components: staging reads its own config and rewrites product URLs.
 *
 * The primary actions live in the page header, where the admin puts them, rather
 * than only at the bottom of a form that grows with every product selected. They
 * drive the feature component through a view query, so the page stays a thin
 * composition layer and the ordering logic stays where it was.
 */
@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [
    OrdersComponent,
    StagingOrdersComponent,
    UiPageComponent,
    UiButtonComponent,
    LucideAngularModule,
  ],
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <ng-container pageActions>
        @if (orders(); as orders) {
          <ui-button
            variant="outline"
            size="sm"
            (click)="orders.saveOrder()"
            [loading]="orders.isSavingOrder"
            testId="page-save-order"
          >
            Save Order
          </ui-button>
          <ui-button
            size="sm"
            (click)="orders.runTest()"
            [loading]="orders.isPlacingOrder"
            testId="page-place-order"
          >
            @if (!orders.isPlacingOrder) {
              <lucide-angular [img]="icons.place" class="size-4" aria-hidden="true" />
            }
            Place Order
          </ui-button>
        }
        @if (staging(); as staging) {
          <ui-button
            variant="outline"
            size="sm"
            (click)="staging.saveConfig()"
            testId="page-save-staging-order"
          >
            Save Order
          </ui-button>
          <ui-button
            variant="warning"
            size="sm"
            (click)="staging.runTest()"
            [loading]="staging.isRunning"
            [disabled]="!staging.stagingBaseUrl"
            testId="page-place-staging-order"
          >
            Place Staging Order
          </ui-button>
        }
      </ng-container>

      @if (isStaging()) {
        <app-staging-orders />
      } @else {
        <app-orders />
      }
    </ui-page>
  `,
})
export class OrdersPageComponent {
  private readonly environment = inject(EnvironmentService);

  protected readonly orders = viewChild(OrdersComponent);
  protected readonly staging = viewChild(StagingOrdersComponent);

  protected readonly copy = SECTION_COPY['orders'];
  protected readonly isStaging = computed(() => this.environment.current() === 'staging');
  protected readonly icons = { place: Play };
}
