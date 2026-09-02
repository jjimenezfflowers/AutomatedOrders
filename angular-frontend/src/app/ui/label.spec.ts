import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiLabelComponent } from './label';

describe('UiLabelComponent', () => {
  let fixture: ComponentFixture<UiLabelComponent>;

  function label(): HTMLLabelElement {
    return fixture.nativeElement.querySelector('label');
  }

  function setInput(name: string, value: unknown) {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiLabelComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(UiLabelComponent);
    fixture.detectChanges();
  });

  it('renders a label element', () => {
    expect(label()).not.toBeNull();
  });

  it('uses the admin density: text-xs and font-semibold, not text-sm font-medium', () => {
    expect(label().className).toContain('text-xs');
    expect(label().className).toContain('font-semibold');
    expect(label().className).not.toContain('text-sm');
  });

  it('associates with a control through for', () => {
    setInput('for', 'email-field');

    expect(label().getAttribute('for')).toBe('email-field');
  });

  it('omits for when no control is given', () => {
    expect(label().getAttribute('for')).toBeNull();
  });

  it('turns destructive when invalid', () => {
    setInput('invalid', true);

    expect(label().className).toContain('text-destructive');
  });

  it('is not destructive by default', () => {
    expect(label().className).not.toContain('text-destructive');
  });

  it('merges the class input rather than replacing it', () => {
    setInput('class', 'mb-1');

    expect(label().className).toContain('mb-1');
    expect(label().className).toContain('font-semibold');
  });
});
