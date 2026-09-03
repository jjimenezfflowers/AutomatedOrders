import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { ENVIRONMENTS, Environment, SectionId, isEnvironment, sectionById } from './navigation';

/**
 * The environment lives in the URL (/dev/products, /staging/orders) rather than in
 * component state, so a link identifies both the section and the store it targets
 * and a reload keeps you where you were. Shared sections carry no prefix.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentService {
  private readonly router = inject(Router);

  private readonly url = signal(this.router.url);

  readonly current = computed<Environment>(() => {
    const segment = this.url().split('?')[0].split('/').filter(Boolean)[0];
    return isEnvironment(segment) ? segment : 'dev';
  });

  readonly section = computed<SectionId | null>(() => {
    const segments = this.url().split('?')[0].split('/').filter(Boolean);
    const candidate = isEnvironment(segments[0]) ? segments[1] : segments[0];
    return sectionById(candidate as SectionId) ? (candidate as SectionId) : null;
  });

  readonly descriptor = computed(() => ENVIRONMENTS.find((item) => item.id === this.current())!);

  /** True when the active section renders against a store, so the badge is meaningful. */
  readonly sectionIsScoped = computed(() => {
    const section = this.section();
    return section ? (sectionById(section)?.scoped ?? false) : false;
  });

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.url.set(event.urlAfterRedirects));
  }

  /** Path for a section under the environment currently in the URL. */
  linkFor(section: SectionId): string[] {
    const item = sectionById(section);
    return item?.scoped ? ['/', this.current(), section] : ['/', section];
  }

  /** Switching store keeps you on the same section rather than sending you home. */
  switchTo(environment: Environment): void {
    const section = this.section();
    const item = section ? sectionById(section) : null;

    if (item?.scoped) {
      this.router.navigate(['/', environment, section]);
      return;
    }

    // On a shared section there is nothing to re-scope, so remember the choice by
    // moving to that store's Products.
    this.router.navigate(['/', environment, 'products']);
  }
}
