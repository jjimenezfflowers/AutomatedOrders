import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiFieldComponent } from './field';
import { UiInputComponent } from './input';

@Component({
  standalone: true,
  imports: [UiFieldComponent, UiInputComponent],
  template: `
    <ui-field [label]="label" [hint]="hint" [error]="error" [optional]="optional" controlId="probe">
      <ui-input inputId="probe" />
    </ui-field>
  `,
})
class HostComponent {
  label? = 'Email';
  hint?: string;
  error?: string | null;
  optional = false;
}

describe('UiFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    detect();
  });

  it('renders the label', () => {
    expect(text()).toContain('Email');
  });

  it('projects the control', () => {
    expect(fixture.nativeElement.querySelector('input')).not.toBeNull();
  });

  it('points the label at the projected control, so clicking it focuses the input', () => {
    const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');

    expect(label.getAttribute('for')).toBe('probe');
    expect(input.getAttribute('id')).toBe('probe');
  });

  it('omits the label row entirely when there is no label', () => {
    host.label = undefined;
    detect();

    expect(fixture.nativeElement.querySelector('label')).toBeNull();
  });

  describe('hint and error', () => {
    it('shows a hint when given', () => {
      host.hint = 'Used for the order confirmation';
      detect();

      expect(text()).toContain('Used for the order confirmation');
    });

    it('shows the error instead of the hint, so the two never stack', () => {
      host.hint = 'a hint';
      host.error = 'Email is required';
      detect();

      expect(text()).toContain('Email is required');
      expect(text()).not.toContain('a hint');
    });

    it('announces the error to assistive tech', () => {
      host.error = 'Email is required';
      detect();

      const message = fixture.nativeElement.querySelector('[role="alert"]');
      expect(message.textContent).toContain('Email is required');
    });

    it('marks the label destructive while in error', () => {
      host.error = 'Email is required';
      detect();

      const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
      expect(label.className).toContain('text-destructive');
    });

    it('renders neither when clean', () => {
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('optional marker', () => {
    it('is hidden by default, so required is the unmarked case', () => {
      expect(text()).not.toContain('optional');
    });

    it('appears when the field is optional', () => {
      host.optional = true;
      detect();

      expect(text()).toContain('optional');
    });
  });

  it('generates a control id when none is supplied', () => {
    const standalone = TestBed.createComponent(UiFieldComponent);
    standalone.detectChanges();

    expect(standalone.componentInstance.controlId).toMatch(/^ui-field-\d+$/);
  });
});
