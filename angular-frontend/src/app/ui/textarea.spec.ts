import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { UiTextareaComponent, textareaClassName } from './textarea';

/** Proves the migration is safe: the app binds every control with [(ngModel)]. */
@Component({
  standalone: true,
  imports: [FormsModule, UiTextareaComponent],
  template: `<ui-textarea [(ngModel)]="notes" />`
})
class TextareaHostComponent {
  notes = '';
}

describe('UiTextareaComponent', () => {
  let component: UiTextareaComponent;
  let fixture: ComponentFixture<UiTextareaComponent>;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function textarea(): HTMLTextAreaElement {
    return fixture.nativeElement.querySelector('textarea');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTextareaComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(UiTextareaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders an empty textarea with the shared field classes and 3 rows', () => {
    expect(textarea().value).toBe('');
    expect(textarea().rows).toBe(3);
    expect(textarea().className).toContain('border-input');
    expect(textarea().className).toContain('min-h-16');
  });

  it('grows instead of pinning the input height', () => {
    expect(textareaClassName).not.toContain('h-9');
  });

  it('omits the admin focus-visible:outline-hidden', () => {
    expect(textareaClassName).not.toContain('outline-hidden');
  });

  it('applies the rows input', () => {
    fixture.componentRef.setInput('rows', 8);
    fixture.detectChanges();

    expect(textarea().rows).toBe(8);
  });

  it('merges the class input instead of replacing the base classes', () => {
    fixture.componentRef.setInput('class', 'col-span-2');
    fixture.detectChanges();

    expect(textarea().className).toContain('col-span-2');
    expect(textarea().className).toContain('rounded-md');
  });

  it('renders the placeholder', () => {
    fixture.componentRef.setInput('placeholder', 'Delivery notes');
    fixture.detectChanges();

    expect(textarea().placeholder).toBe('Delivery notes');
  });

  it('reflects writeValue into the DOM', () => {
    component.writeValue('leave at the door');
    detect();

    expect(textarea().value).toBe('leave at the door');
  });

  it('coerces a null model value to an empty string', () => {
    component.writeValue(null);
    detect();

    expect(textarea().value).toBe('');
  });

  it('emits typed text through registerOnChange', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    textarea().value = 'ring the bell';
    textarea().dispatchEvent(new Event('input'));

    expect(changes).toEqual(['ring the bell']);
  });

  it('notifies registerOnTouched on blur', () => {
    const touched = jasmine.createSpy('touched');
    component.registerOnTouched(touched);

    textarea().dispatchEvent(new Event('blur'));

    expect(touched).toHaveBeenCalled();
  });

  it('disables the native textarea through setDisabledState', () => {
    expect(textarea().disabled).toBe(false);

    component.setDisabledState(true);
    detect();

    expect(textarea().disabled).toBe(true);
  });

  it('sets aria-invalid when invalid', () => {
    expect(textarea().getAttribute('aria-invalid')).toBeNull();

    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    expect(textarea().getAttribute('aria-invalid')).toBe('true');
  });

  it('round-trips through [(ngModel)]', async () => {
    const host = TestBed.createComponent(TextareaHostComponent);
    host.componentInstance.notes = 'from the model';
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();

    const element: HTMLTextAreaElement = host.nativeElement.querySelector('textarea');
    expect(element.value).toBe('from the model');

    element.value = 'from the view';
    element.dispatchEvent(new Event('input'));
    await host.whenStable();

    expect(host.componentInstance.notes).toBe('from the view');
  });
});
