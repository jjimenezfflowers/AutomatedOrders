import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let mediaListeners: ((event: { matches: boolean }) => void)[];

  function makeService(options: { stored?: string | null; systemDark?: boolean } = {}) {
    mediaListeners = [];

    if (options.stored === undefined || options.stored === null) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, options.stored);
    }

    spyOn(window, 'matchMedia').and.returnValue({
      matches: options.systemDark ?? false,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.push(listener),
    } as unknown as MediaQueryList);

    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ThemeService] });
    return TestBed.inject(ThemeService);
  }

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    TestBed.resetTestingModule();
  });

  describe('defaults', () => {
    it('follows the system preference when nothing is stored', () => {
      const service = makeService();

      expect(service.theme()).toBe('system');
    });

    it('resolves to light when the system prefers light', () => {
      const service = makeService({ systemDark: false });

      expect(service.resolved()).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBeFalse();
    });

    it('resolves to dark when the system prefers dark', () => {
      const service = makeService({ systemDark: true });

      expect(service.resolved()).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBeTrue();
    });
  });

  describe('explicit selection', () => {
    it('applies the dark class on <html>, which is what theme.css keys off', () => {
      const service = makeService();

      service.set('dark');

      expect(document.documentElement.classList.contains('dark')).toBeTrue();
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('removes the dark class when switching back to light', () => {
      const service = makeService({ systemDark: true });

      service.set('light');

      expect(document.documentElement.classList.contains('dark')).toBeFalse();
    });

    it('overrides the system preference', () => {
      const service = makeService({ systemDark: true });

      service.set('light');

      expect(service.resolved()).toBe('light');
    });
  });

  describe('persistence', () => {
    it('stores the preference', () => {
      const service = makeService();

      service.set('dark');

      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('restores a stored preference on construction', () => {
      const service = makeService({ stored: 'dark', systemDark: false });

      expect(service.theme()).toBe('dark');
      expect(service.resolved()).toBe('dark');
    });

    it('ignores a corrupt stored value rather than throwing', () => {
      const service = makeService({ stored: 'chartreuse' });

      expect(service.theme()).toBe('system');
    });
  });

  describe('system changes', () => {
    it('follows the OS when the preference is system', () => {
      const service = makeService({ systemDark: false });

      mediaListeners.forEach((listener) => listener({ matches: true }));

      expect(service.resolved()).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBeTrue();
    });

    it('does not follow the OS once a theme is chosen explicitly', () => {
      const service = makeService({ systemDark: false });
      service.set('light');

      mediaListeners.forEach((listener) => listener({ matches: true }));

      expect(service.resolved()).toBe('light');
    });
  });

  describe('cycle', () => {
    it('steps light → dark → system → light', () => {
      const service = makeService();
      service.set('light');

      service.cycle();
      expect(service.theme()).toBe('dark');

      service.cycle();
      expect(service.theme()).toBe('system');

      service.cycle();
      expect(service.theme()).toBe('light');
    });
  });
});
