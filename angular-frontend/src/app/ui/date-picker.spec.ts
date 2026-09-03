import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { UiDatePickerComponent, formatIsoDate, parseIsoDate, toIsoDate } from './date-picker';

/** Proves the migration is safe: the app binds every control with [(ngModel)]. */
@Component({
  standalone: true,
  imports: [FormsModule, UiDatePickerComponent],
  template: `<ui-date-picker testId="host-picker" [(ngModel)]="deliveryDate" />`,
})
class DatePickerHostComponent {
  deliveryDate = '';
}

describe('UiDatePickerComponent', () => {
  let component: UiDatePickerComponent;
  let fixture: ComponentFixture<UiDatePickerComponent>;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  /** ui-* components put data-testid on the native element, not the host. */
  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[data-testid="picker"]');
  }

  function popover(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="dialog"]');
  }

  function day(iso: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`button[data-day="${iso}"]`);
  }

  function focusedDay(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[data-focused="true"]');
  }

  function monthLabel(): string {
    return fixture.nativeElement.querySelector('[aria-live="polite"]').textContent.trim();
  }

  function openPicker() {
    trigger().click();
    fixture.detectChanges();
  }

  function press(key: string) {
    popover()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiDatePickerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(UiDatePickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('testId', 'picker');
    fixture.detectChanges();
  });

  it('renders the placeholder while empty and the formatted date once set', () => {
    expect(trigger().textContent?.trim()).toBe('Select a date');

    component.writeValue('2026-09-10');
    detect();

    expect(trigger().textContent?.trim()).toBe('Sep 10, 2026');
  });

  it('takes the placeholder from its input', () => {
    fixture.componentRef.setInput('placeholder', 'Delivery date');
    fixture.detectChanges();

    expect(trigger().textContent?.trim()).toBe('Delivery date');
  });

  it('lines the trigger up with ui-input and merges the class input', () => {
    fixture.componentRef.setInput('class', 'mt-4');
    fixture.detectChanges();

    expect(trigger().className).toContain('mt-4');
    expect(trigger().className).toContain('border-input');
    expect(trigger().className).toContain('h-9');
  });

  it('opens writeValue(\'2026-09-10\') on September 2026 with the 10th selected', () => {
    component.writeValue('2026-09-10');
    detect();
    openPicker();

    expect(monthLabel()).toBe('September 2026');
    expect(day('2026-09-10').getAttribute('aria-selected')).toBe('true');
    expect(day('2026-09-09').getAttribute('aria-selected')).toBe('false');
    expect(day('2026-09-10').className).toContain('bg-primary');
  });

  it('opens on today when there is no value', () => {
    const today = new Date();
    openPicker();

    expect(focusedDay().getAttribute('data-day')).toBe(
      toIsoDate(today.getFullYear(), today.getMonth(), today.getDate()),
    );
    expect(focusedDay().getAttribute('data-today')).toBe('true');
  });

  it('emits the picked day as an ISO string through registerOnChange', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    component.writeValue('2026-09-15');
    detect();
    openPicker();
    day('2026-09-10').click();
    fixture.detectChanges();

    expect(changes).toEqual(['2026-09-10']);
    expect(typeof changes[0]).toBe('string');
  });

  /*
   * The classic off-by-one: `new Date(2026, 9, 1).toISOString()` is 2026-09-30 for
   * anyone east of Greenwich and 2026-10-01 west of it. Month edges catch it.
   */
  it('emits month-boundary days without a timezone shift', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    component.writeValue('2026-10-15');
    detect();
    openPicker();
    day('2026-10-01').click();
    fixture.detectChanges();

    openPicker();
    day('2026-10-31').click();
    fixture.detectChanges();

    expect(changes).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('round-trips through [(ngModel)]', async () => {
    const host = TestBed.createComponent(DatePickerHostComponent);
    host.componentInstance.deliveryDate = '2026-09-10';
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();

    const hostTrigger: HTMLButtonElement = host.nativeElement.querySelector(
      'button[data-testid="host-picker"]',
    );
    expect(hostTrigger.textContent?.trim()).toBe('Sep 10, 2026');

    hostTrigger.click();
    host.detectChanges();
    host.nativeElement.querySelector('button[data-day="2026-09-12"]').click();
    await host.whenStable();
    host.detectChanges();

    expect(host.componentInstance.deliveryDate).toBe('2026-09-12');
    expect(hostTrigger.textContent?.trim()).toBe('Sep 12, 2026');
  });

  it('cannot be opened once setDisabledState disables it', () => {
    component.setDisabledState(true);
    detect();

    expect(trigger().disabled).toBe(true);

    // Dispatched rather than clicked: a disabled button swallows .click() outright.
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(popover()).toBeNull();
  });

  it('disables the days outside min/max and ignores clicks on them', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    fixture.componentRef.setInput('min', '2026-09-05');
    fixture.componentRef.setInput('max', '2026-09-20');
    component.writeValue('2026-09-10');
    detect();
    openPicker();

    expect(day('2026-09-04').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-09-21').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-09-05').getAttribute('aria-disabled')).toBeNull();
    expect(day('2026-09-20').getAttribute('aria-disabled')).toBeNull();

    day('2026-09-04').click();
    fixture.detectChanges();

    expect(changes).toEqual([]);
    expect(popover()).not.toBeNull();
    expect(day('2026-09-10').getAttribute('aria-selected')).toBe('true');
  });

  it('steps a month at a time, rolling the year over December', () => {
    component.writeValue('2026-12-15');
    detect();
    openPicker();

    expect(monthLabel()).toBe('December 2026');

    fixture.nativeElement.querySelector('button[aria-label="Next month"]').click();
    fixture.detectChanges();

    expect(monthLabel()).toBe('January 2027');
    expect(day('2027-01-15')).not.toBeNull();

    fixture.nativeElement.querySelector('button[aria-label="Previous month"]').click();
    fixture.detectChanges();

    expect(monthLabel()).toBe('December 2026');
  });

  it('renders the adjacent-month days, visually distinct from the current month', () => {
    component.writeValue('2026-09-10');
    detect();
    openPicker();

    // September 2026 starts on a Tuesday, so the grid leads with Aug 30-31.
    expect(day('2026-08-31').getAttribute('data-outside')).toBe('true');
    expect(day('2026-08-31').className).toContain('text-muted-foreground/60');
    expect(day('2026-10-01').getAttribute('data-outside')).toBe('true');
    expect(day('2026-09-10').getAttribute('data-outside')).toBeNull();
    expect(day('2026-09-10').className).not.toContain('text-muted-foreground/60');
  });

  it('opens from the keyboard on Enter and on Space', () => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(popover()).not.toBeNull();

    press('Escape');
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();

    expect(popover()).not.toBeNull();
  });

  it('moves the focused day with the arrow keys and selects it with Enter', () => {
    const changes: string[] = [];
    component.registerOnChange((value: string) => changes.push(value));

    component.writeValue('2026-09-10');
    detect();
    openPicker();

    expect(focusedDay().getAttribute('data-day')).toBe('2026-09-10');
    expect(document.activeElement).toBe(focusedDay());

    press('ArrowRight');
    expect(focusedDay().getAttribute('data-day')).toBe('2026-09-11');

    press('ArrowDown');
    expect(focusedDay().getAttribute('data-day')).toBe('2026-09-18');
    expect(document.activeElement).toBe(focusedDay());

    press('ArrowLeft');
    press('ArrowUp');
    expect(focusedDay().getAttribute('data-day')).toBe('2026-09-10');

    press('Enter');

    expect(changes).toEqual(['2026-09-10']);
    expect(popover()).toBeNull();
  });

  it('pages by month with PageUp and PageDown', () => {
    component.writeValue('2026-09-10');
    detect();
    openPicker();

    press('PageDown');
    expect(monthLabel()).toBe('October 2026');
    expect(focusedDay().getAttribute('data-day')).toBe('2026-10-10');

    press('PageUp');
    press('PageUp');
    expect(monthLabel()).toBe('August 2026');
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    openPicker();
    expect(popover()).not.toBeNull();

    press('Escape');

    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click outside, leaving focus where the user put it', () => {
    openPicker();
    expect(popover()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(popover()).toBeNull();
    // Focus is deliberately not pulled back: the outside click is usually a click
    // into another control, and stealing focus from it would be worse than useless.
    expect(document.activeElement).not.toBe(trigger());
  });

  it('stays open when the click lands inside the popover', () => {
    openPicker();

    popover()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(popover()).not.toBeNull();
  });

  it('sets aria-invalid when invalid', () => {
    expect(trigger().getAttribute('aria-invalid')).toBeNull();

    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-invalid')).toBe('true');
  });

  it('labels the trigger with the current value', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Select a date');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    component.writeValue('2026-09-10');
    detect();

    expect(trigger().getAttribute('aria-label')).toBe('Select a date, selected Sep 10, 2026');
  });

  it('exposes the dialog and grid roles', () => {
    openPicker();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(popover()!.getAttribute('role')).toBe('dialog');
    expect(fixture.nativeElement.querySelector('[role="grid"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[role="row"]').length).toBe(7);
    expect(fixture.nativeElement.querySelectorAll('[role="columnheader"]').length).toBe(7);
    expect(fixture.nativeElement.querySelectorAll('[role="gridcell"]').length).toBe(42);
  });

  it('keeps the value available to native form submission', () => {
    fixture.componentRef.setInput('name', 'deliveryDate');
    component.writeValue('2026-09-10');
    detect();

    const hidden: HTMLInputElement = fixture.nativeElement.querySelector('input[type="hidden"]');
    expect(hidden.name).toBe('deliveryDate');
    expect(hidden.value).toBe('2026-09-10');
  });

  it('notifies registerOnTouched when the trigger is blurred', () => {
    const touched = jasmine.createSpy('touched');
    component.registerOnTouched(touched);

    trigger().dispatchEvent(new Event('blur'));

    expect(touched).toHaveBeenCalled();
  });

  it('ignores a value that is not an ISO date', () => {
    component.writeValue('10/09/2026');
    detect();

    expect(trigger().textContent?.trim()).toBe('Select a date');
  });
});

describe('date-picker ISO helpers', () => {
  it('formats local parts without going through UTC', () => {
    expect(toIsoDate(2026, 0, 1)).toBe('2026-01-01');
    expect(toIsoDate(2026, 11, 31)).toBe('2026-12-31');
    expect(formatIsoDate('2026-09-10')).toBe('Sep 10, 2026');
    expect(formatIsoDate('')).toBe('');
  });

  it('rejects dates that do not exist', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-9-1')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('2026-02-28')).toEqual({ year: 2026, month: 1, day: 28 });
  });
});
