import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { OrdersComponent } from '../../orders/orders';
import { StagingOrdersComponent } from '../../staging-orders/staging-orders';
import { UiPageComponent } from '../../ui';
import { EnvironmentService } from '../environment.service';
import { SECTION_COPY } from '../navigation';

/**
 * Orders is environment-scoped, and unlike Products the two environments are
 * different components: staging reads its own config and rewrites product URLs.
 */
@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [OrdersComponent, StagingOrdersComponent, UiPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
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

  protected readonly copy = SECTION_COPY['orders'];
  protected readonly isStaging = computed(() => this.environment.current() === 'staging');
}
