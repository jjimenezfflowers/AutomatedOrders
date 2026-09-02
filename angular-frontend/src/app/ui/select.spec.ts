import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { UiSelectComponent, selectVariants } from './select';

const OPTIONS = [
  { value: 'roses', label: 'Roses' },
  { value: 'tulips', label: 'Tulips' }
];

/** Proves the migration is safe: the app binds every control with [(ngModel)]. */
@Component({
  standalone: true,
  imports: [FormsModule, UiSelectComponent],
  template: `<ui-select [options]="options" [(ngModel)]="choice" />`
})
class SelectHostComponent {
  options = OPTIONS;
  choice = '';
}

@Component({
  standalone: true,
  imports: [UiSelectComponent],
  template: `
    <ui-select placeholder="Pick one">
      <option value="own">Own option</option>
    </ui-select>
  `
})
class ProjectedOptionsHostComponent {}

describe('UiSelectComponent', () => {
  let component: UiSelectComponent;
  let fixture: ComponentFixture<UiSelectComponent>;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function select(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSelectComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(UiSelectComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.detectChanges();
  });

  it('renders the default size', () => {
    expect(select().getAttribute('data-size')).toBe('default');
    expect(select().className).toContain('border-input');
  });

  it('renders each size as its own data-size, which drives the height utilities', () => {
    expect(select().getAttribute('data-size')).toBe('default');

    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();

    expect(select().getAttribute('data-size')).toBe('sm');
    expect(select().className).toContain('data-[size=default]:h-9');
    expect(select().className).toContain('data-[size=sm]:h-8');
  });

  it('omits the admin trigger outline-none so the global focus ring survives', () => {
    expect(selectVariants()).not.toContain('outline-none');
  });

  it('merges the class input instead of replacing the base classes', () => {
    fixture.componentRef.setInput('class', 'mt-4');
    fixture.detectChanges();

    expect(select().className).toContain('mt-4');
    expect(select().className).toContain('rounded-md');
  });

  it('renders the options array', () => {
    const labels = Array.from(select().options).map(option => option.textContent?.trim());
    expect(labels).toEqual(['Roses', 'Tulips']);
  });

  it('renders projected options supplied by the caller', () => {
    const projected = TestBed.createComponent(ProjectedOptionsHostComponent);
    projected.detectChanges();

    const element: HTMLSelectElement = projected.nativeElement.querySelector('select');
    const labels = Array.from(element.options).map(option => option.textContent?.trim());
    expect(labels).toEqual(['Pick one', 'Own option']);
  });

  it('marks itself as showing the placeholder while empty', () => {
    fixture.componentRef.setInput('placeholder', 'Pick one');
    fixture.detectChanges();

    expect(select().hasAttribute('data-placeholder')).toBe(true);

    component.writeValue('roses');
    detect();

    expect(select().hasAttribute('data-placeholder')).toBe(false);
  });

  it('reflects writeValue into the DOM', () => {
    component.writeValue('tulips');
    detect();

    expect(select().value).toBe('tulips');
  });

  it('emits the chosen value through registerOnChange', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    select().value = 'roses';
    select().dispatchEvent(new Event('change'));

    expect(changes).toEqual(['roses']);
  });

  it('notifies registerOnTouched on blur', () => {
    const touched = jasmine.createSpy('touched');
    component.registerOnTouched(touched);

    select().dispatchEvent(new Event('blur'));

    expect(touched).toHaveBeenCalled();
  });

  it('disables the native select through setDisabledState', () => {
    expect(select().disabled).toBe(false);

    component.setDisabledState(true);
    detect();

    expect(select().disabled).toBe(true);
  });

  it('sets aria-invalid when invalid', () => {
    expect(select().getAttribute('aria-invalid')).toBeNull();

    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    expect(select().getAttribute('aria-invalid')).toBe('true');
  });

  it('round-trips through [(ngModel)]', async () => {
    const host = TestBed.createComponent(SelectHostComponent);
    host.componentInstance.choice = 'tulips';
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();

    const element: HTMLSelectElement = host.nativeElement.querySelector('select');
    expect(element.value).toBe('tulips');

    element.value = 'roses';
    element.dispatchEvent(new Event('change'));
    await host.whenStable();

    expect(host.componentInstance.choice).toBe('roses');
  });
});
