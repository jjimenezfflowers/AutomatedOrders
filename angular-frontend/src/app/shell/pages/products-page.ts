import { Component, computed, inject } from '@angular/core';

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
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
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
