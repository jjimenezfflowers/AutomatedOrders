import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'bb-order-automation.theme';

/*
 * theme.css defines `.dark` alongside `:root`, and declares
 * `@custom-variant dark (&:is(.dark *))`, so switching themes is a matter of
 * toggling the `dark` class on <html>. 'system' follows the OS preference and
 * keeps following it as that preference changes.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly preference = signal<Theme>('system');
  private readonly systemPrefersDark = signal(false);

  /** The theme actually applied, with 'system' resolved. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return preference;
  });

  readonly theme = this.preference.asReadonly();

  constructor() {
    const stored = this.read();
    if (stored) this.preference.set(stored);

    const query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemPrefersDark.set(query.matches);
      query.addEventListener('change', (event) => {
        this.systemPrefersDark.set(event.matches);
        this.apply();
      });
    }

    this.apply();
  }

  set(theme: Theme): void {
    this.preference.set(theme);
    this.write(theme);
    this.apply();
  }

  /** Cycles light → dark → system, the order the toggle steps through. */
  cycle(): void {
    const order: Theme[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.preference()) + 1) % order.length];
    this.set(next);
  }

  private apply(): void {
    this.document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
    this.document.documentElement.style.colorScheme = this.resolved();
  }

  private read(): Theme | null {
    try {
      const value = this.document.defaultView?.localStorage?.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' || value === 'system' ? value : null;
    } catch {
      // Storage can throw when disabled; falling back to 'system' is fine.
      return null;
    }
  }

  private write(theme: Theme): void {
    try {
      this.document.defaultView?.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Persistence is a convenience, not a requirement.
    }
  }
}
