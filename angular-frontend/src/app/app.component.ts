import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Menu, Moon, Sun, Monitor, Flower2, ChevronDown } from 'lucide-angular';

import { CustomerComponent } from './customer/customer';
import { HistoryComponent } from './history/history';
import { LogsComponent } from './logs/logs';
import { OrdersComponent } from './orders/orders';
import { ProductsComponent } from './products/products';
import { StagingOrdersComponent } from './staging-orders/staging-orders';
import { ENVIRONMENTS, Environment, NAV_GROUPS, SectionId, sectionById } from './shell/navigation';
import { ThemeService, cx } from './ui';

const SIDEBAR_STORAGE_KEY = 'bb-order-automation.sidebar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LucideAngularModule,
    ProductsComponent,
    OrdersComponent,
    CustomerComponent,
    HistoryComponent,
    StagingOrdersComponent,
    LogsComponent,
  ],
  // Deliberately not OnPush: the app is zoneless and the feature components still
  // assign plain fields inside HTTP subscriptions. An OnPush shell would not be
  // marked dirty by those updates and would block change detection from reaching
  // them, leaving lists empty. Revisit once the children are signal-based.
  templateUrl: './app.html',
})
export class AppComponent {
  private readonly themeService = inject(ThemeService);

  readonly groups = NAV_GROUPS;
  readonly environments = ENVIRONMENTS;

  readonly activeSection = signal<SectionId>('products');
  readonly environment = signal<Environment>('dev');
  readonly sidebarOpen = signal(this.readSidebarState());
  readonly environmentMenuOpen = signal(false);

  readonly theme = this.themeService.theme;
  readonly resolvedTheme = this.themeService.resolved;

  readonly icons = { menu: Menu, moon: Moon, sun: Sun, system: Monitor, brand: Flower2, chevron: ChevronDown };

  readonly activeEnvironment = computed(
    () => this.environments.find((item) => item.id === this.environment())!,
  );

  readonly pageTitle = computed(() => sectionById(this.activeSection())?.label ?? '');

  /** Whether the current section renders against the selected store. */
  readonly pageIsScoped = computed(() => sectionById(this.activeSection())?.scoped ?? false);

  readonly themeIcon = computed(() => {
    const preference = this.theme();
    if (preference === 'system') return this.icons.system;
    return preference === 'dark' ? this.icons.moon : this.icons.sun;
  });

  showSection(section: SectionId): void {
    this.activeSection.set(section);
  }

  selectEnvironment(environment: Environment): void {
    this.environment.set(environment);
    this.environmentMenuOpen.set(false);
  }

  toggleEnvironmentMenu(): void {
    this.environmentMenuOpen.update((open) => !open);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => {
      this.writeSidebarState(!open);
      return !open;
    });
  }

  cycleTheme(): void {
    this.themeService.cycle();
  }

  navItemClasses(section: SectionId): string {
    // Mirrors the admin's sidebarMenuButtonVariants: hover and active share a
    // background, and font weight is what distinguishes the active item.
    const active = this.activeSection() === section;
    return cx(
      'flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm',
      'transition-[width,height,padding] hover:bg-accent hover:text-accent-foreground',
      active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80',
    );
  }

  private readSidebarState(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'closed';
    } catch {
      return true;
    }
  }

  private writeSidebarState(open: boolean): void {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'open' : 'closed');
    } catch {
      // Persistence is a convenience.
    }
  }
}
