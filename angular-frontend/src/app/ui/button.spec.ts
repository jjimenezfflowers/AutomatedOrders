import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ButtonSize, ButtonVariant, UiButtonComponent } from './button';

describe('UiButtonComponent', () => {
  let fixture: ComponentFixture<UiButtonComponent>;
  let component: UiButtonComponent;

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  /** OnPush + zoneless: inputs must be set through componentRef to mark the view dirty. */
  function setInput(name: string, value: unknown) {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  function detect() {
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiButtonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(UiButtonComponent);
    component = fixture.componentInstance;
    detect();
  });

  it('renders a button of type button by default', () => {
    expect(button().getAttribute('type')).toBe('button');
  });

  it('applies the default variant and size', () => {
    expect(button().className).toContain('bg-primary-900');
    expect(button().className).toContain('h-9');
  });

  describe('variants', () => {
    const cases: ButtonVariant[] = [
      'default',
      'destructive',
      'outline',
      'secondary',
      'elevated',
      'ghost',
      'warning',
      'link',
    ];

    it('produces a distinct class string per variant', () => {
      const rendered = cases.map((variant) => {
        setInput('variant', variant);
        return button().className;
      });

      expect(new Set(rendered).size).toBe(cases.length);
    });

    it('styles warning against the warning token, so staging actions need no overrides', () => {
      setInput('variant', 'warning');

      expect(button().className).toContain('bg-warning');
      expect(button().className).toContain('hover:bg-warning/90');
    });

    it('styles destructive against the destructive token', () => {
      setInput('variant', 'destructive');

      expect(button().className).toContain('text-destructive');
    });
  });

  describe('sizes', () => {
    const cases: ButtonSize[] = ['xs', 'sm', 'default', 'md', 'lg', 'icon'];

    it('produces a distinct class string per size', () => {
      const rendered = cases.map((size) => {
        setInput('size', size);
        return button().className;
      });

      expect(new Set(rendered).size).toBe(cases.length);
    });
  });

  describe('the class input', () => {
    it('merges rather than replaces the variant classes', () => {
      setInput('class', 'w-full');

      expect(button().className).toContain('w-full');
      expect(button().className).toContain('bg-primary-900');
    });
  });

  describe('disabled and loading', () => {
    it('disables the native button', () => {
      setInput('disabled', true);

      expect(button().disabled).toBeTrue();
    });

    it('disables while loading, so a slow action cannot be fired twice', () => {
      setInput('loading', true);

      expect(button().disabled).toBeTrue();
      expect(button().getAttribute('aria-busy')).toBe('true');
    });

    it('renders a spinner only while loading', () => {
      expect(fixture.nativeElement.querySelector('.animate-spin')).toBeNull();

      setInput('loading', true);

      expect(fixture.nativeElement.querySelector('.animate-spin')).not.toBeNull();
    });

    it('is not busy when idle', () => {
      expect(button().getAttribute('aria-busy')).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('sets aria-invalid when invalid', () => {
      setInput('invalid', true);

      expect(button().getAttribute('aria-invalid')).toBe('true');
    });

    it('omits aria-invalid when valid, rather than setting it to false', () => {
      expect(button().getAttribute('aria-invalid')).toBeNull();
    });

    it('does not suppress the focus outline the way the admin button does', () => {
      // bb-remix's button base string ends in `outline-none` with no
      // focus-visible rule, leaving keyboard focus invisible. See styles.css.
      expect(button().className).not.toContain('outline-none');
    });
  });

  it('exposes a test id hook', () => {
    setInput('testId', 'place-order');

    expect(button().getAttribute('data-testid')).toBe('place-order');
  });
});
