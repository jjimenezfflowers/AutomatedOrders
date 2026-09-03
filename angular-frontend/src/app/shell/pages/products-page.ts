import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { ProductsComponent } from '../../products/products';
import { UiPageComponent } from '../../ui';
import { BreadcrumbService } from '../breadcrumb.service';
import { EnvironmentService } from '../environment.service';
import { SECTION_COPY } from '../navigation';

export type ProductFormMode = 'new' | 'edit' | null;

/**
 * Products is environment-scoped: the route's /dev or /staging segment decides which
 * catalogue the same component loads.
 *
 * The create and edit forms are sub-routes rather than component state, so the URL
 * says where you are, the back button works, and a reload keeps you in the form.
 * The page publishes a breadcrumb for those, since the list is no longer on screen.
 */
@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [ProductsComponent, UiPageComponent],
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
  template: `
    <ui-page [title]="title()" [description]="description()">
      <app-products
        [apiEndpoint]="endpoint()"
        [formMode]="formMode()"
        [formProductId]="productId()"
        (formClosed)="backToList()"
        (createRequested)="openForm(['new'])"
        (editRequested)="openForm([$event.id, 'edit'])"
      />
    </ui-page>
  `,
})
export class ProductsPageComponent {
  private readonly environment = inject(EnvironmentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly breadcrumbs = inject(BreadcrumbService);

  private readonly copy = SECTION_COPY['products'];

  protected readonly formMode = toSignal(
    this.route.data.pipe(map((data) => (data['productForm'] ?? null) as ProductFormMode)),
    { initialValue: null as ProductFormMode },
  );

  protected readonly productId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('productId'))),
    { initialValue: null as string | null },
  );

  protected readonly endpoint = computed(() =>
    this.environment.current() === 'staging' ? '/api/staging-products' : '/api/products',
  );

  protected readonly title = computed(() => {
    const mode = this.formMode();
    if (mode === 'new') return 'New Product';
    if (mode === 'edit') return 'Edit Product';
    return this.copy.title;
  });

  protected readonly description = computed(() => {
    const mode = this.formMode();
    if (mode === 'new') return 'Add a product for automated runs to order from.';
    if (mode === 'edit') return 'Change this product’s selectors, variants or quantity.';
    return this.copy.description;
  });

  constructor() {
    effect(() => {
      const mode = this.formMode();
      const listLink = ['/', this.environment.current(), 'products'];

      // Only the sub-views need a trail; the list is where the sidebar already says.
      this.breadcrumbs.set(
        mode ? [{ label: this.copy.title, link: listLink }, { label: this.title() }] : [],
      );
    });
  }

  protected openForm(segments: string[]): void {
    this.router.navigate(['/', this.environment.current(), 'products', ...segments]);
  }

  protected backToList(): void {
    this.router.navigate(['/', this.environment.current(), 'products']);
  }
}
