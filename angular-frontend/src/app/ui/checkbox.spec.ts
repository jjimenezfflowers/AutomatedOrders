import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { UiCheckboxComponent } from './checkbox';

/** Proves the migration is safe: the app binds every control with [(ngModel)]. */
@Component({
  standalone: true,
  imports: [FormsModule, UiCheckboxComponent],
  template: `<ui-checkbox [(ngModel)]="agreed" />`
})
class CheckboxHostComponent {
  agreed = false;
}

describe('UiCheckboxComponent', () => {
  let component: UiCheckboxComponent;
  let fixture: ComponentFixture<UiCheckboxComponent>;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function box(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCheckboxComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(UiCheckboxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders an unchecked native checkbox with the base classes', () => {
    expect(box().type).toBe('checkbox');
    expect(box().checked).toBe(false);
    expect(box().className).toContain('accent-primary');
    expect(box().classList).toContain('h-4');
    expect(box().classList).toContain('w-4');
  });

  it('merges the class input instead of replacing the base classes', () => {
    fixture.componentRef.setInput('class', 'mr-2');
    fixture.detectChanges();

    expect(box().className).toContain('mr-2');
    expect(box().className).toContain('rounded-sm');
  });

  it('renders an inline label only when one is given', () => {
    expect(fixture.nativeElement.querySelector('label')).toBeNull();

    fixture.componentRef.setInput('label', 'Include shipping');
    fixture.componentRef.setInput('inputId', 'shipping');
    fixture.detectChanges();

    const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
    expect(label.textContent?.trim()).toBe('Include shipping');
    expect(label.getAttribute('for')).toBe('shipping');
  });

  it('reflects writeValue into the DOM', () => {
    component.writeValue(true);
    detect();

    expect(box().checked).toBe(true);

    component.writeValue(false);
    detect();

    expect(box().checked).toBe(false);
  });

  it('coerces a null model value to unchecked', () => {
    component.writeValue(null);
    detect();

    expect(box().checked).toBe(false);
  });

  it('emits a boolean through registerOnChange when checked', () => {
    const changes: boolean[] = [];
    component.registerOnChange((value: boolean) => changes.push(value));

    box().checked = true;
    box().dispatchEvent(new Event('change'));

    box().checked = false;
    box().dispatchEvent(new Event('change'));

    expect(changes).toEqual([true, false]);
  });

  it('notifies registerOnTouched on blur', () => {
    const touched = jasmine.createSpy('touched');
    component.registerOnTouched(touched);

    box().dispatchEvent(new Event('blur'));

    expect(touched).toHaveBeenCalled();
  });

  it('disables the native checkbox through setDisabledState', () => {
    expect(box().disabled).toBe(false);

    component.setDisabledState(true);
    detect();

    expect(box().disabled).toBe(true);
  });

  it('sets aria-invalid when invalid', () => {
    expect(box().getAttribute('aria-invalid')).toBeNull();

    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  it('round-trips through [(ngModel)]', async () => {
    const host = TestBed.createComponent(CheckboxHostComponent);
    host.componentInstance.agreed = true;
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();

    const element: HTMLInputElement = host.nativeElement.querySelector('input');
    expect(element.checked).toBe(true);

    element.checked = false;
    element.dispatchEvent(new Event('change'));
    await host.whenStable();

    expect(host.componentInstance.agreed).toBe(false);
  });
});
