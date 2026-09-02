import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlertVariant, UiAlertComponent, alertVariants } from './alert';

const VARIANTS: AlertVariant[] = ['info', 'success', 'warning', 'destructive'];

@Component({
  standalone: true,
  imports: [UiAlertComponent],
  template: `<ui-alert variant="destructive" title="Submission failed">Retry in a moment.</ui-alert>`
})
class AlertHostComponent {}

describe('UiAlertComponent', () => {
  let fixture: ComponentFixture<UiAlertComponent>;

  function alert(): HTMLElement {
    return fixture.nativeElement.querySelector('[role="alert"]');
  }

  function icon(): HTMLElement {
    return fixture.nativeElement.querySelector('lucide-angular');
  }

  /** lucide-angular takes `class` as an @Input and paints the SVG it generates. */
  function iconSvg(): SVGElement {
    return fixture.nativeElement.querySelector('lucide-angular svg');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAlertComponent, AlertHostComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(UiAlertComponent);
    fixture.detectChanges();
  });

  it('renders the default info variant as an alert region', () => {
    expect(alert()).toBeTruthy();
    expect(alert().className).toContain('bg-info/10');
    expect(alert().className).toContain('rounded-lg');
  });

  it('gives every variant a distinct class string', () => {
    const rendered = VARIANTS.map(variant => alertVariants({ variant }));
    expect(new Set(rendered).size).toBe(VARIANTS.length);
  });

  it('renders each variant with its tint and its icon colour', () => {
    const expected: Record<AlertVariant, string> = {
      info: 'info',
      success: 'success',
      warning: 'warning',
      destructive: 'destructive'
    };

    for (const variant of VARIANTS) {
      fixture.componentRef.setInput('variant', variant);
      fixture.detectChanges();

      expect(alert().className).toContain(`bg-${expected[variant]}/10`);
      expect(alert().className).toContain(`border-${expected[variant]}/20`);
      expect(iconSvg().classList).toContain(`text-${expected[variant]}`);
    }
  });

  it('swaps the lucide icon per variant', () => {
    const paths = new Set<string>();

    for (const variant of VARIANTS) {
      fixture.componentRef.setInput('variant', variant);
      fixture.detectChanges();

      paths.add(iconSvg().innerHTML);
    }

    expect(paths.size).toBe(VARIANTS.length);
  });

  it('hides the decorative icon from assistive technology', () => {
    expect(icon().getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the title only when one is given', () => {
    expect(fixture.nativeElement.querySelector('p')).toBeNull();

    fixture.componentRef.setInput('title', 'Heads up');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('p').textContent?.trim()).toBe('Heads up');
  });

  it('merges the class input instead of replacing the variant classes', () => {
    fixture.componentRef.setInput('class', 'mb-4');
    fixture.detectChanges();

    expect(alert().className).toContain('mb-4');
    expect(alert().className).toContain('bg-info/10');
  });

  it('exposes testId', () => {
    fixture.componentRef.setInput('testId', 'submit-error');
    fixture.detectChanges();

    expect(alert().getAttribute('data-testid')).toBe('submit-error');
  });

  it('projects its content alongside the title', () => {
    const host = TestBed.createComponent(AlertHostComponent);
    host.detectChanges();

    const element: HTMLElement = host.nativeElement.querySelector('[role="alert"]');
    expect(element.className).toContain('bg-destructive/10');
    expect(element.textContent).toContain('Submission failed');
    expect(element.textContent).toContain('Retry in a moment.');
  });
});
