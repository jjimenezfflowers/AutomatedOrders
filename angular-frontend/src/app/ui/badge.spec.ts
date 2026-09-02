import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BadgeVariant, UiBadgeComponent, badgeVariants } from './badge';

const VARIANTS: BadgeVariant[] = [
  'default',
  'secondary',
  'success',
  'warning',
  'destructive',
  'outline'
];

@Component({
  standalone: true,
  imports: [UiBadgeComponent],
  template: `<ui-badge variant="success">Submitted</ui-badge>`
})
class BadgeHostComponent {}

describe('UiBadgeComponent', () => {
  let fixture: ComponentFixture<UiBadgeComponent>;

  function badge(): HTMLElement {
    return fixture.nativeElement.querySelector('span');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiBadgeComponent, BadgeHostComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(UiBadgeComponent);
    fixture.detectChanges();
  });

  it('renders the default variant', () => {
    expect(badge().className).toContain('bg-primary-900');
    expect(badge().className).toContain('rounded-sm');
  });

  it('gives every variant a distinct class string', () => {
    const rendered = VARIANTS.map(variant => badgeVariants({ variant }));
    expect(new Set(rendered).size).toBe(VARIANTS.length);
  });

  it('renders each variant onto the element', () => {
    const expected: Record<BadgeVariant, string> = {
      default: 'bg-primary-900',
      secondary: 'bg-secondary',
      success: 'bg-success/10',
      warning: 'bg-warning/10',
      destructive: 'bg-destructive/10',
      outline: 'border-border'
    };

    for (const variant of VARIANTS) {
      fixture.componentRef.setInput('variant', variant);
      fixture.detectChanges();

      expect(badge().className).toContain(expected[variant]);
    }
  });

  it('tints the semantic variants rather than filling them, as theme.css prescribes', () => {
    for (const variant of ['success', 'warning', 'destructive'] as BadgeVariant[]) {
      expect(badgeVariants({ variant })).toContain(`bg-${variant}/10`);
      expect(badgeVariants({ variant })).toContain(`text-${variant}`);
    }
  });

  it('merges the class input instead of replacing the variant classes', () => {
    fixture.componentRef.setInput('class', 'ml-2');
    fixture.detectChanges();

    expect(badge().className).toContain('ml-2');
    expect(badge().className).toContain('bg-primary-900');
  });

  it('exposes testId', () => {
    fixture.componentRef.setInput('testId', 'status-badge');
    fixture.detectChanges();

    expect(badge().getAttribute('data-testid')).toBe('status-badge');
  });

  it('projects its content', () => {
    const host = TestBed.createComponent(BadgeHostComponent);
    host.detectChanges();

    const element: HTMLElement = host.nativeElement.querySelector('span');
    expect(element.textContent?.trim()).toBe('Submitted');
    expect(element.className).toContain('bg-success/10');
  });
});
