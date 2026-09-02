import { Location } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { THEME_STORAGE_KEY } from './ui';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let location: Location;

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  /** Feature components fetch on init; nothing here asserts on those requests. */
  function flushChildRequests() {
    httpMock.match(() => true).forEach((request) => request.flush([]));
  }

  async function goto(path: string) {
    await router.navigateByUrl(path);
    detect();
    flushChildRequests();
    detect();
  }

  beforeEach(async () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem('bb-order-automation.sidebar');

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    detect();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('creates', async () => {
    await goto('/dev/products');
    expect(component).toBeTruthy();
  });

  it('shows the product brand, not the old "Order Manager" heading', async () => {
    await goto('/dev/products');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('BloomBrain');
    expect(text).not.toContain('Order Manager');
  });

  describe('routing', () => {
    // Regression: sections used to swap through an @switch on component state, so
    // every tab lived at "/" — no deep links, no browser back, nothing to share.
    it('sends the root to the dev catalogue', async () => {
      await goto('/');
      expect(location.path()).toBe('/dev/products');
    });

    it('sends an unknown path to the dev catalogue rather than a blank page', async () => {
      await goto('/nonsense');
      expect(location.path()).toBe('/dev/products');
    });

    it('sends a bare environment to that store’s catalogue', async () => {
      await goto('/staging');
      expect(location.path()).toBe('/staging/products');
    });

    for (const path of ['/dev/products', '/staging/products', '/dev/orders', '/staging/orders']) {
      it(`resolves the environment-scoped route ${path}`, async () => {
        await goto(path);
        expect(location.path()).toBe(path);
      });
    }

    for (const path of ['/customer', '/history', '/logs']) {
      it(`resolves the shared route ${path} without an environment prefix`, async () => {
        await goto(path);
        expect(location.path()).toBe(path);
      });
    }

    it('navigating from the sidebar changes the URL', async () => {
      await goto('/dev/products');

      query<HTMLAnchorElement>('nav-history')!.click();
      detect();
      await fixture.whenStable();
      detect();

      expect(location.path()).toBe('/history');
    });
  });

  describe('environment', () => {
    it('reads the environment out of the URL', async () => {
      await goto('/staging/products');
      expect(component.environment()).toBe('staging');
    });

    it('defaults to dev on a shared section', async () => {
      await goto('/customer');
      expect(component.environment()).toBe('dev');
    });

    it('switching store keeps you on the same section', async () => {
      await goto('/dev/orders');

      component.selectEnvironment('staging');
      detect();
      await fixture.whenStable();
      detect();
      flushChildRequests();

      expect(location.path()).toBe('/staging/orders');
    });

    it('scopes the products endpoint to the selected store', async () => {
      await router.navigateByUrl('/staging/products');
      detect();

      const requests = httpMock.match((request) => request.url === '/api/staging-products');
      expect(requests.length).toBeGreaterThan(0);
      flushChildRequests();
    });

    it('renders the staging orders component on the staging route', async () => {
      await goto('/staging/orders');

      expect(fixture.nativeElement.querySelector('app-staging-orders')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-orders')).toBeNull();
    });

    it('renders the dev orders component on the dev route', async () => {
      await goto('/dev/orders');

      expect(fixture.nativeElement.querySelector('app-orders')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-staging-orders')).toBeNull();
    });
  });

  describe('navigation menu', () => {
    it('lists each section exactly once, so the two stores do not duplicate it', () => {
      const ids = component.groups.flatMap((group) => group.items.map((item) => item.id));

      expect(ids).toEqual(['products', 'orders', 'customer', 'history', 'logs']);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('keeps scoped links under the current store', async () => {
      await goto('/staging/products');

      expect(component.linkFor('orders')).toEqual(['/', 'staging', 'orders']);
    });

    it('leaves shared links unprefixed', async () => {
      await goto('/staging/products');

      expect(component.linkFor('history')).toEqual(['/', 'history']);
    });

    it('marks the active item for assistive tech', async () => {
      await goto('/dev/products');

      expect(query('nav-products')!.getAttribute('aria-current')).toBe('page');
      expect(query('nav-history')!.getAttribute('aria-current')).toBeNull();
    });

    it('distinguishes the active item by weight, as the admin does', () => {
      expect(component.navItemClasses(true)).toContain('font-medium');
      expect(component.navItemClasses(false)).not.toContain('font-medium');
    });
  });

  describe('environment badge', () => {
    it('shows on environment-scoped sections', async () => {
      await goto('/dev/products');
      expect(query('environment-badge')?.textContent?.trim()).toBe('DEV');
    });

    it('hides on shared sections, where the store is irrelevant', async () => {
      await goto('/customer');

      expect(component.pageIsScoped()).toBeFalse();
      expect(query('environment-badge')).toBeNull();
    });
  });

  describe('sidebar', () => {
    it('starts open', () => {
      expect(component.sidebarOpen()).toBeTrue();
    });

    it('collapses and persists the choice', async () => {
      await goto('/dev/products');

      query<HTMLButtonElement>('sidebar-toggle')!.click();
      detect();

      expect(component.sidebarOpen()).toBeFalse();
      expect(localStorage.getItem('bb-order-automation.sidebar')).toBe('closed');
    });

    it('keeps every section reachable on small screens, where the sidebar is hidden', async () => {
      await goto('/dev/products');

      for (const id of ['products', 'orders', 'customer', 'history', 'logs']) {
        expect(query(`nav-mobile-${id}`)).withContext(id).not.toBeNull();
      }
    });
  });

  describe('theme toggle', () => {
    it('cycles the preference', async () => {
      await goto('/dev/products');
      const before = component.theme();

      query<HTMLButtonElement>('theme-toggle')!.click();
      detect();

      expect(component.theme()).not.toBe(before);
    });

    it('applies the dark class that theme.css keys off', async () => {
      await goto('/dev/products');

      component.cycleTheme();
      while (component.theme() !== 'dark') component.cycleTheme();
      detect();

      expect(document.documentElement.classList.contains('dark')).toBeTrue();
    });

    it('labels the control with the current preference', async () => {
      await goto('/dev/products');

      expect(query('theme-toggle')!.getAttribute('aria-label')).toContain(component.theme());
    });
  });

  describe('page title', () => {
    it('reflects the active section', async () => {
      await goto('/dev/products');
      expect(component.pageTitle()).toBe('Products');

      await goto('/logs');
      expect(component.pageTitle()).toBe('Logs');
    });
  });
});
