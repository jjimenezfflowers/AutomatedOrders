import { Injectable, signal } from '@angular/core';

import { UiCrumb } from '../ui/breadcrumb';

/**
 * Pages publish their trail here and the top bar renders it, the way the admin
 * portals its breadcrumbs into the top bar's home slot. A page that publishes
 * nothing falls back to its title, so only pages with a sub-view need to care.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly trail = signal<UiCrumb[]>([]);

  readonly crumbs = this.trail.asReadonly();

  set(crumbs: UiCrumb[]): void {
    this.trail.set(crumbs);
  }

  clear(): void {
    this.trail.set([]);
  }
}
