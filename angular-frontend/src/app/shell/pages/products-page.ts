import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProductsComponent } from '../../products/products';
import { UiPageComponent } from '../../ui';
import { EnvironmentService } from '../environment.service';
import { SECTION_COPY } from '../navigation';

/**
 * Products is environment-scoped: the route's /dev or /staging segment decides which
 * catalogue the same component loads.
 */
@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [ProductsComponent, UiPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <app-products [apiEndpoint]="endpoint()" />
    </ui-page>
  `,
})
export class ProductsPageComponent {
  private readonly environment = inject(EnvironmentService);

  protected readonly copy = SECTION_COPY['products'];

  protected readonly endpoint = computed(() =>
    this.environment.current() === 'staging' ? '/api/staging-products' : '/api/products',
  );
}
