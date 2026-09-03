import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  booleanAttribute,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CalendarDays, ChevronLeft, ChevronRight, LucideAngularModule } from 'lucide-angular';

import { inputClassName } from './input';
import { cx } from './variants';

/*
 * A calendar popover in place of <input type="date">, which every browser draws
 * differently and which no design token can reach. The model value is kept as the
 * same ISO `YYYY-MM-DD` string the native input produced, so callers migrate by
 * swapping the tag — their [(ngModel)] and their TypeScript stay as they are.
 *
 * Every date here is handled as year/month/day integers and rendered by hand.
 * Date objects are only ever built from local parts (`new Date(y, m, d)`) and read
 * back with the local getters; `Date.parse('2026-09-01')` and `toISOString()` are
 * both UTC-based and would land on August 31st for anyone west of Greenwich.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTH_NAMES = MONTH_NAMES.map((month) => month.slice(0, 3));

const WEEKDAYS = [
  { short: 'Su', long: 'Sunday' },
  { short: 'Mo', long: 'Monday' },
  { short: 'Tu', long: 'Tuesday' },
  { short: 'We', long: 'Wednesday' },
  { short: 'Th', long: 'Thursday' },
  { short: 'Fr', long: 'Friday' },
  { short: 'Sa', long: 'Saturday' },
];

interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** One cell of the day grid, including the days borrowed from the adjacent months. */
export interface UiDatePickerDay {
  iso: string;
  label: number;
  outside: boolean;
  disabled: boolean;
  today: boolean;
  selected: boolean;
  ariaLabel: string;
  classes: string;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** Formats local parts, never a UTC instant — this is what keeps the day from shifting. */
export function toIsoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month + 1, 2)}-${pad(day, 2)}`;
}

export function parseIsoDate(value: string | null | undefined): DateParts | null {
  const match = ISO_DATE.exec(value ?? '');
  if (!match) {
    return null;
  }

  const parts = { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  // Rejects 2026-02-31 and friends: the constructor rolls them into the next month.
  const rolled = new Date(parts.year, parts.month, parts.day);
  return rolled.getMonth() === parts.month && rolled.getDate() === parts.day ? parts : null;
}

/** `2026-09-10` → `Sep 10, 2026`. Hand-rolled so the rendering does not vary by locale. */
export function formatIsoDate(value: string | null | undefined): string {
  const parts = parseIsoDate(value);
  return parts ? `${SHORT_MONTH_NAMES[parts.month]} ${parts.day}, ${parts.year}` : '';
}

function todayParts(): DateParts {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

/*
 * The trigger is a button, but it sits in the same forms as ui-input and has to line
 * up with it, so it reuses that class string rather than approximating it.
 */
export const datePickerTriggerClassName = cx(
  inputClassName,
  'items-center justify-between gap-2 text-left disabled:opacity-50',
);

const dayBaseClassName =
  'flex size-8 items-center justify-center rounded-md text-sm font-normal transition-colors';

@Component({
  selector: 'ui-date-picker',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiDatePickerComponent),
      multi: true,
    },
  ],
  template: `
    <button
      #trigger
      type="button"
      aria-haspopup="dialog"
      [class]="classes"
      [disabled]="disabled"
      [attr.id]="inputId"
      [attr.aria-expanded]="open"
      [attr.aria-label]="triggerLabel"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy"
      [attr.data-testid]="testId"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      (blur)="onTouched()"
    >
      <span [class]="value ? '' : 'text-muted-foreground'">{{ display }}</span>
      <lucide-angular [img]="calendarIcon" class="size-4 shrink-0 opacity-60" aria-hidden="true" />
    </button>

    <!-- Keeps the value in native form submissions, which a <button> trigger cannot do. -->
    <input type="hidden" [attr.name]="name" [value]="value" />

    @if (open) {
      <div
        role="dialog"
        aria-label="Choose date"
        class="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-2 w-72 rounded-md border p-3 shadow-md"
        [attr.data-testid]="testId ? testId + '-popover' : null"
        (keydown)="onPopoverKeydown($event)"
      >
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            class="hover:bg-accent hover:text-accent-foreground flex size-7 items-center justify-center rounded-md transition-colors"
            (click)="stepMonth(-1)"
          >
            <lucide-angular [img]="previousIcon" class="size-4" aria-hidden="true" />
          </button>
          <div class="text-sm font-medium" aria-live="polite">{{ monthLabel }}</div>
          <button
            type="button"
            aria-label="Next month"
            class="hover:bg-accent hover:text-accent-foreground flex size-7 items-center justify-center rounded-md transition-colors"
            (click)="stepMonth(1)"
          >
            <lucide-angular [img]="nextIcon" class="size-4" aria-hidden="true" />
          </button>
        </div>

        <div role="grid" [attr.aria-label]="monthLabel">
          <div role="row" class="grid grid-cols-7">
            @for (weekday of weekdays; track weekday.short) {
              <div
                role="columnheader"
                [attr.aria-label]="weekday.long"
                class="text-muted-foreground flex size-8 items-center justify-center text-xs"
              >
                {{ weekday.short }}
              </div>
            }
          </div>
          @for (week of weeks; track $index) {
            <div role="row" class="grid grid-cols-7">
              @for (day of week; track day.iso) {
                <button
                  type="button"
                  role="gridcell"
                  [class]="day.classes"
                  [attr.data-day]="day.iso"
                  [attr.data-outside]="day.outside ? 'true' : null"
                  [attr.data-today]="day.today ? 'true' : null"
                  [attr.data-focused]="day.iso === focusedIso ? 'true' : null"
                  [attr.tabindex]="day.iso === focusedIso ? 0 : -1"
                  [attr.aria-selected]="day.selected"
                  [attr.aria-disabled]="day.disabled ? 'true' : null"
                  [attr.aria-label]="day.ariaLabel"
                  (click)="selectDay(day)"
                >
                  {{ day.label }}
                </button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class UiDatePickerComponent implements ControlValueAccessor, AfterViewChecked {
  @Input() placeholder = 'Select a date';
  @Input() inputId?: string;
  @Input() name?: string;
  @Input() describedBy?: string;
  @Input() testId?: string;
  /** ISO `YYYY-MM-DD` bounds; days outside them render disabled and cannot be picked. */
  @Input() min?: string;
  @Input() max?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  /** Extra utilities merged after the trigger classes, for layout only. */
  @Input() class = '';

  @ViewChild('trigger', { static: true })
  private readonly triggerRef!: ElementRef<HTMLButtonElement>;

  protected readonly calendarIcon = CalendarDays;
  protected readonly previousIcon = ChevronLeft;
  protected readonly nextIcon = ChevronRight;
  protected readonly weekdays = WEEKDAYS;

  protected value = '';
  protected disabled = false;
  protected open = false;
  protected weeks: UiDatePickerDay[][] = [];
  protected focusedIso = '';

  private viewYear = todayParts().year;
  private viewMonth = todayParts().month;
  /** Set when the roving focus must land on a day the next time the grid is rendered. */
  private pendingFocus = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  get classes(): string {
    return cx(datePickerTriggerClassName, this.class);
  }

  protected get display(): string {
    return formatIsoDate(this.value) || this.placeholder;
  }

  protected get triggerLabel(): string {
    const formatted = formatIsoDate(this.value);
    return formatted ? `${this.placeholder}, selected ${formatted}` : this.placeholder;
  }

  protected get monthLabel(): string {
    return `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
  }

  ngAfterViewChecked(): void {
    if (!this.pendingFocus) {
      return;
    }

    this.pendingFocus = false;
    this.host.nativeElement.querySelector<HTMLElement>('[data-focused="true"]')?.focus();
  }

  writeValue(value: string | null): void {
    const parts = parseIsoDate(value);
    this.value = parts ? toIsoDate(parts.year, parts.month, parts.day) : '';
    this.syncViewToValue();
    this.buildWeeks();
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.open = false;
    }
    this.cdr.markForCheck();
  }

  /* A click anywhere else dismisses the popover; the click that opened it is inside the host. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open || this.host.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.close({ returnFocus: false });
  }

  protected toggle(): void {
    if (this.disabled) {
      return;
    }

    if (this.open) {
      this.close();
    } else {
      this.openPicker();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') {
      return;
    }

    /*
     * Opening here rather than letting the browser synthesise a click: preventDefault
     * suppresses that click, so Enter and Space open the popover instead of opening it
     * on keydown and closing it again on the activation click.
     */
    event.preventDefault();
    if (!this.open) {
      this.openPicker();
    }
  }

  protected onPopoverKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      case 'ArrowLeft':
        return this.moveFocus(-1, 0, event);
      case 'ArrowRight':
        return this.moveFocus(1, 0, event);
      case 'ArrowUp':
        return this.moveFocus(-7, 0, event);
      case 'ArrowDown':
        return this.moveFocus(7, 0, event);
      case 'PageUp':
        return this.moveFocus(0, -1, event);
      case 'PageDown':
        return this.moveFocus(0, 1, event);
      case 'Enter':
      case ' ': {
        const focused = this.weeks.flat().find((day) => day.iso === this.focusedIso);
        if (focused) {
          event.preventDefault();
          this.selectDay(focused);
        }
        return;
      }
      default:
        return;
    }
  }

  protected stepMonth(delta: number): void {
    this.shiftView(0, delta);
    this.cdr.markForCheck();
  }

  protected selectDay(day: UiDatePickerDay): void {
    if (day.disabled) {
      return;
    }

    this.value = day.iso;
    this.onChange(this.value);
    this.onTouched();
    this.buildWeeks();
    this.close();
  }

  private openPicker(): void {
    this.open = true;
    this.syncViewToValue();
    this.buildWeeks();
    this.pendingFocus = true;
    this.cdr.markForCheck();
  }

  private close(options: { returnFocus?: boolean } = {}): void {
    this.open = false;
    this.pendingFocus = false;
    if (options.returnFocus !== false) {
      this.triggerRef.nativeElement.focus();
    }
    this.cdr.markForCheck();
  }

  private moveFocus(days: number, months: number, event: KeyboardEvent): void {
    event.preventDefault();
    this.shiftView(days, months);
    this.pendingFocus = true;
    this.cdr.markForCheck();
  }

  /** Moves the focused day (and the month on show with it) by whole days and months. */
  private shiftView(days: number, months: number): void {
    const from = parseIsoDate(this.focusedIso) ?? todayParts();
    // Clamped so PageDown from the 31st lands on the last day of a shorter month.
    const day = Math.min(from.day, daysInMonth(from.year, from.month + months));
    const moved = new Date(from.year, from.month + months, day + days);

    this.viewYear = moved.getFullYear();
    this.viewMonth = moved.getMonth();
    this.focusedIso = toIsoDate(moved.getFullYear(), moved.getMonth(), moved.getDate());
    this.buildWeeks();
  }

  private syncViewToValue(): void {
    const parts = parseIsoDate(this.value) ?? todayParts();
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.focusedIso = toIsoDate(parts.year, parts.month, parts.day);
  }

  private buildWeeks(): void {
    const today = todayParts();
    const todayIso = toIsoDate(today.year, today.month, today.day);
    const leading = new Date(this.viewYear, this.viewMonth, 1).getDay();
    const weeks: UiDatePickerDay[][] = [];

    for (let week = 0; week < 6; week++) {
      const row: UiDatePickerDay[] = [];

      for (let column = 0; column < 7; column++) {
        // Out-of-range day numbers roll into the neighbouring month, in local time.
        const date = new Date(this.viewYear, this.viewMonth, week * 7 + column + 1 - leading);
        const iso = toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
        const day = {
          iso,
          label: date.getDate(),
          outside: date.getMonth() !== this.viewMonth,
          disabled: this.isOutOfRange(iso),
          today: iso === todayIso,
          selected: iso === this.value,
          ariaLabel: formatIsoDate(iso),
        };
        row.push({ ...day, classes: this.dayClasses(day) });
      }

      weeks.push(row);
    }

    this.weeks = weeks;
  }

  /** ISO dates sort lexicographically, so the bounds need no parsing. */
  private isOutOfRange(iso: string): boolean {
    return (!!this.min && iso < this.min) || (!!this.max && iso > this.max);
  }

  private dayClasses(day: Omit<UiDatePickerDay, 'classes'>): string {
    return cx(
      dayBaseClassName,
      day.outside && !day.selected && 'text-muted-foreground/60',
      day.today && !day.selected && 'ring-primary/40 font-medium ring-1',
      day.selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
      !day.selected && !day.disabled && 'hover:bg-accent hover:text-accent-foreground',
      day.disabled && 'text-muted-foreground cursor-not-allowed opacity-40',
    );
  }
}
