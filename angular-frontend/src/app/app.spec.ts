import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { THEME_STORAGE_KEY } from './ui';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let httpMock: HttpTestingController;

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  /** The child components fetch on init; nothing here asserts on those requests. */
  function flushChildRequests() {
    httpMock.match(() => true).forEach((request) => request.flush([]));
  }

  beforeEach(async () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem('bb-order-automation.sidebar');

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    detect();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('creates', () => {
    flushChildRequests();
    expect(component).toBeTruthy();
  });

  it('shows the product brand, not the old "Order Manager" heading', () => {
    flushChildRequests();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('BloomBrain');
    expect(text).not.toContain('Order Manager');
  });

  describe('navigation', () => {
    it('opens on Products', () => {
      flushChildRequests();
      expect(component.activeSection()).toBe('products');
    });

    it('lists each section exactly once, so DEV and STAGING no longer duplicate the menu', () => {
      flushChildRequests();
      const ids = component.groups.flatMap((group) => group.items.map((item) => item.id));

      expect(ids).toEqual(['products', 'orders', 'customer', 'history', 'logs']);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('switches section on click', () => {
      flushChildRequests();

      query<HTMLButtonElement>('nav-history')!.click();
      detect();
      flushChildRequests();

      expect(component.activeSection()).toBe('history');
    });

    it('marks the active item for assistive tech', () => {
      flushChildRequests();

      expect(query('nav-products')!.getAttribute('aria-current')).toBe('page');
      expect(query('nav-history')!.getAttribute('aria-current')).toBeNull();
    });

    it('distinguishes the active item by weight, as the admin does', () => {
      flushChildRequests();

      expect(component.navItemClasses('products')).toContain('font-medium');
      expect(component.navItemClasses('history')).not.toContain('font-medium');
    });
  });

  describe('environment switcher', () => {
    it('starts on dev', () => {
      flushChildRequests();
      expect(component.environment()).toBe('dev');
    });

    it('offers both stores', () => {
      flushChildRequests();
      expect(component.environments.map((item) => item.id)).toEqual(['dev', 'staging']);
    });

    it('opens and closes the menu', () => {
      flushChildRequests();

      query<HTMLButtonElement>('environment-switcher')!.click();
      detect();
      expect(component.environmentMenuOpen()).toBeTrue();

      component.toggleEnvironmentMenu();
      detect();
      expect(component.environmentMenuOpen()).toBeFalse();
    });

    it('selecting an environment closes the menu', () => {
      flushChildRequests();
      component.toggleEnvironmentMenu();
      detect();

      component.selectEnvironment('staging');
      detect();
      flushChildRequests();

      expect(component.environment()).toBe('staging');
      expect(component.environmentMenuOpen()).toBeFalse();
    });

    it('scopes Products to the selected store', () => {
      flushChildRequests();
      component.selectEnvironment('staging');
      detect();

      const requests = httpMock.match((request) => request.url === '/api/staging-products');
      expect(requests.length).toBeGreaterThan(0);
      flushChildRequests();
    });

    it('renders the staging orders component when staging is selected', () => {
      flushChildRequests();
      component.showSection('orders');
      detect();
      flushChildRequests();

      component.selectEnvironment('staging');
      detect();
      flushChildRequests();

      expect(fixture.nativeElement.querySelector('app-staging-orders')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-orders')).toBeNull();
    });
  });

  describe('environment badge', () => {
    it('shows on environment-scoped sections', () => {
      flushChildRequests();
      expect(query('environment-badge')?.textContent?.trim()).toBe('DEV');
    });

    it('hides on shared sections, where the store is irrelevant', () => {
      flushChildRequests();
      component.showSection('customer');
      detect();
      flushChildRequests();

      expect(component.pageIsScoped()).toBeFalse();
      expect(query('environment-badge')).toBeNull();
    });
  });

  describe('sidebar', () => {
    it('starts open', () => {
      flushChildRequests();
      expect(component.sidebarOpen()).toBeTrue();
    });

    it('collapses and persists the choice', () => {
      flushChildRequests();

      query<HTMLButtonElement>('sidebar-toggle')!.click();
      detect();

      expect(component.sidebarOpen()).toBeFalse();
      expect(localStorage.getItem('bb-order-automation.sidebar')).toBe('closed');
    });

    it('keeps every section reachable on small screens, where the sidebar is hidden', () => {
      flushChildRequests();

      for (const id of ['products', 'orders', 'customer', 'history', 'logs']) {
        expect(query(`nav-mobile-${id}`)).withContext(id).not.toBeNull();
      }
    });
  });

  describe('theme toggle', () => {
    it('cycles the preference', () => {
      flushChildRequests();
      const before = component.theme();

      query<HTMLButtonElement>('theme-toggle')!.click();
      detect();

      expect(component.theme()).not.toBe(before);
    });

    it('applies the dark class that theme.css keys off', () => {
      flushChildRequests();

      component.cycleTheme();
      while (component.theme() !== 'dark') component.cycleTheme();
      detect();

      expect(document.documentElement.classList.contains('dark')).toBeTrue();
    });

    it('labels the control with the current preference', () => {
      flushChildRequests();

      expect(query('theme-toggle')!.getAttribute('aria-label')).toContain(component.theme());
    });
  });

  describe('page title', () => {
    it('reflects the active section', () => {
      flushChildRequests();
      expect(component.pageTitle()).toBe('Products');

      component.showSection('logs');
      detect();
      flushChildRequests();

      expect(component.pageTitle()).toBe('Logs');
    });
  });
});
