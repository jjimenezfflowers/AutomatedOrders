import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule, Menu, Moon, Sun, Monitor, Flower2, ChevronDown } from 'lucide-angular';

import { EnvironmentService } from './shell/environment.service';
import { ENVIRONMENTS, Environment, NAV_GROUPS, SECTION_COPY } from './shell/navigation';
import { ThemeService, cx } from './ui';

const SIDEBAR_STORAGE_KEY = 'bb-order-automation.sidebar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  // Deliberately not OnPush: the feature components still assign plain fields inside
  // HTTP subscriptions. An OnPush shell is not marked dirty by those updates and
  // blocks change detection from reaching them, leaving lists empty.
  templateUrl: './app.html',
})
export class AppComponent {
  private readonly themeService = inject(ThemeService);
  protected readonly environmentService = inject(EnvironmentService);

  readonly groups = NAV_GROUPS;
  readonly environments = ENVIRONMENTS;
  readonly sectionCopy = SECTION_COPY;

  readonly environmentMenuOpen = signal(false);
  readonly sidebarOpen = signal(this.readSidebarState());

  readonly theme = this.themeService.theme;
  readonly environment = this.environmentService.current;
  readonly activeEnvironment = this.environmentService.descriptor;
  readonly activeSection = this.environmentService.section;
  readonly pageIsScoped = this.environmentService.sectionIsScoped;

  readonly icons = {
    menu: Menu,
    moon: Moon,
    sun: Sun,
    system: Monitor,
    brand: Flower2,
    chevron: ChevronDown,
  };

  readonly pageTitle = computed(() => {
    const section = this.activeSection();
    return section ? SECTION_COPY[section].title : '';
  });

  readonly themeIcon = computed(() => {
    const preference = this.theme();
    if (preference === 'system') return this.icons.system;
    return preference === 'dark' ? this.icons.moon : this.icons.sun;
  });

  linkFor(section: (typeof NAV_GROUPS)[number]['items'][number]['id']): string[] {
    return this.environmentService.linkFor(section);
  }

  selectEnvironment(environment: Environment): void {
    this.environmentService.switchTo(environment);
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

  /**
   * Mirrors the admin's sidebarMenuButtonVariants: hover and active share a
   * background, and font weight is what distinguishes the active item. RouterLinkActive
   * supplies the active flag rather than a manual URL comparison.
   */
  navItemClasses(active: boolean): string {
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
