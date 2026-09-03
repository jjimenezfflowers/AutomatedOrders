import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { UiInputComponent } from './input';

@Component({
  standalone: true,
  imports: [UiInputComponent, FormsModule],
  template: `<ui-input [(ngModel)]="value" [type]="type" name="probe" />`,
})
class HostComponent {
  value: string | number | null = '';
  type: 'text' | 'number' = 'text';
}

describe('UiInputComponent', () => {
  let fixture: ComponentFixture<UiInputComponent>;
  let component: UiInputComponent;

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
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
      imports: [UiInputComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(UiInputComponent);
    component = fixture.componentInstance;
    detect();
  });

  it('renders a text input by default', () => {
    expect(input().getAttribute('type')).toBe('text');
  });

  it('applies the shared input styling', () => {
    expect(input().className).toContain('border-input');
    expect(input().className).toContain('rounded-md');
  });

  it('merges the class input rather than replacing it', () => {
    setInput('class', 'w-24');

    expect(input().className).toContain('w-24');
    expect(input().className).toContain('border-input');
  });

  it('does not suppress the focus ring the way the admin input does', () => {
    // bb-remix's input uses `focus-visible:outline-hidden` with no replacement.
    expect(input().className).not.toContain('outline-hidden');
  });

  describe('ControlValueAccessor', () => {
    it('writeValue reflects into the DOM', () => {
      component.writeValue('hello');
      detect();

      expect(input().value).toBe('hello');
    });

    it('writeValue treats null as empty rather than rendering "null"', () => {
      component.writeValue(null);
      detect();

      expect(input().value).toBe('');
    });

    it('emits through registerOnChange as the user types', () => {
      const changes: unknown[] = [];
      component.registerOnChange((value) => changes.push(value));

      input().value = 'typed';
      input().dispatchEvent(new Event('input'));

      expect(changes).toEqual(['typed']);
    });

    it('marks touched on blur', () => {
      let touched = false;
      component.registerOnTouched(() => (touched = true));

      input().dispatchEvent(new Event('blur'));

      expect(touched).toBeTrue();
    });

    it('setDisabledState disables the native control', () => {
      component.setDisabledState(true);
      detect();

      expect(input().disabled).toBeTrue();
    });

    it('emits numbers, not strings, for number inputs', () => {
      setInput('type', 'number');
      const changes: unknown[] = [];
      component.registerOnChange((value) => changes.push(value));

      input().value = '42';
      input().dispatchEvent(new Event('input'));

      expect(changes).toEqual([42]);
    });

    it('emits null when a number input is cleared', () => {
      setInput('type', 'number');
      const changes: unknown[] = [];
      component.registerOnChange((value) => changes.push(value));

      input().value = '';
      input().dispatchEvent(new Event('input'));

      expect(changes).toEqual([null]);
    });
  });

  describe('readonly', () => {
    // A readonly field stays focusable, selectable and submittable; a disabled one
    // is none of those. The product-id field in edit mode needs the former.
    it('marks the native input readonly without disabling it', () => {
      setInput('readonly', true);

      expect(input().readOnly).toBeTrue();
      expect(input().disabled).toBeFalse();
    });

    it('is editable by default', () => {
      expect(input().readOnly).toBeFalse();
    });

    it('reads as inert without being disabled', () => {
      setInput('readonly', true);

      // bg-muted signals "not editable"; the dimming that disabled:opacity-50 would
      // apply never kicks in, because the control is not actually disabled.
      expect(input().className).toContain('bg-muted');
      expect(input().disabled).toBeFalse();
    });

    it('still reflects a written value', () => {
      setInput('readonly', true);
      component.writeValue('locked-id');
      detect();

      expect(input().value).toBe('locked-id');
    });
  });

  describe('accessibility', () => {
    it('sets aria-invalid when invalid', () => {
      setInput('invalid', true);

      expect(input().getAttribute('aria-invalid')).toBe('true');
    });

    it('wires aria-describedby when given', () => {
      setInput('describedBy', 'field-error');

      expect(input().getAttribute('aria-describedby')).toBe('field-error');
    });
  });
});

describe('UiInputComponent through [(ngModel)]', () => {
  // The migration swaps <input class="…"> for <ui-input> in templates that all
  // bind with [(ngModel)]. This is the test that proves no component TypeScript
  // has to change.
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  // ngModel writes into the control on a microtask, so the view needs a second
  // pass after it settles before the DOM reflects a model change.
  async function settle() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await settle();
  });

  it('pushes the model value down into the input', async () => {
    host.value = 'jose@fiftyflowers.com';
    await settle();

    expect(input().value).toBe('jose@fiftyflowers.com');
  });

  it('pulls user input back up into the model', async () => {
    input().value = '124 Ben St';
    input().dispatchEvent(new Event('input'));
    await settle();

    expect(host.value).toBe('124 Ben St');
  });

  it('round-trips a number without stringifying it', async () => {
    host.type = 'number';
    await settle();

    input().value = '3';
    input().dispatchEvent(new Event('input'));
    await settle();

    expect(host.value).toBe(3);
  });
});
