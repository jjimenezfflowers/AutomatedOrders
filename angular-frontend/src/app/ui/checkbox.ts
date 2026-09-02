import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  booleanAttribute,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { cx } from './variants';

/*
 * From the admin's Checkbox root (bb-remix app/shared/components/ui/checkbox.tsx).
 * The admin wraps a Radix button and paints the checked state itself with
 * `data-[state=checked]:bg-primary`; a native input gets the same result from
 * `accent-primary`, so the size, border and radius carry over unchanged.
 */
export const checkboxClassName =
  'peer h-4 w-4 shrink-0 rounded-sm border border-primary accent-primary ' +
  'disabled:cursor-not-allowed disabled:border-gray-600 disabled:opacity-50 ' +
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';

@Component({
  selector: 'ui-checkbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiCheckboxComponent),
      multi: true,
    },
  ],
  template: `
    <span class="inline-flex items-center gap-2">
      <input
        type="checkbox"
        [class]="classes"
        [checked]="value"
        [disabled]="disabled"
        [attr.id]="inputId"
        [attr.name]="name"
        [attr.aria-invalid]="invalid ? 'true' : null"
        [attr.aria-describedby]="describedBy"
        [attr.data-testid]="testId"
        (change)="onToggle($event)"
        (blur)="onTouched()"
      />
      @if (label) {
        <label [attr.for]="inputId" class="text-xs leading-none font-semibold">{{ label }}</label>
      }
    </span>
  `,
})
export class UiCheckboxComponent implements ControlValueAccessor {
  /** Optional inline label rendered after the box; needs `inputId` to be clickable. */
  @Input() label = '';
  @Input() inputId?: string;
  @Input() name?: string;
  @Input() describedBy?: string;
  @Input() testId?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  /** Extra utilities merged after the box classes, for layout only. */
  @Input() class = '';

  protected value = false;
  protected disabled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: boolean) => void = () => {};
  protected onTouched: () => void = () => {};

  get classes(): string {
    return cx(checkboxClassName, this.class);
  }

  writeValue(value: boolean | null): void {
    this.value = Boolean(value);
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  protected onToggle(event: Event): void {
    this.value = (event.target as HTMLInputElement).checked;
    this.onChange(this.value);
  }
}
