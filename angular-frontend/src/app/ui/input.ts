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

export type UiInputType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'password' | 'url';

/*
 * From the admin's `inputClassName` (bb-remix app/shared/components/ui/input.tsx),
 * minus its `focus-visible:outline-hidden`: that line removes the browser default
 * without replacing it, leaving keyboard focus invisible. The global :focus-visible
 * ring in styles.css handles focus here instead.
 */
export const inputClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm/tight shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';

@Component({
  selector: 'ui-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiInputComponent),
      multi: true,
    },
  ],
  template: `
    <input
      [type]="type"
      [class]="classes"
      [value]="value ?? ''"
      [placeholder]="placeholder"
      [disabled]="disabled"
      [readOnly]="readonly"
      [attr.id]="inputId"
      [attr.name]="name"
      [attr.min]="min"
      [attr.max]="max"
      [attr.step]="step"
      [attr.autocomplete]="autocomplete"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy"
      [attr.data-testid]="testId"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
  `,
})
export class UiInputComponent implements ControlValueAccessor {
  @Input() type: UiInputType = 'text';
  @Input() placeholder = '';
  @Input() inputId?: string;
  @Input() name?: string;
  @Input() min?: string | number;
  @Input() max?: string | number;
  @Input() step?: string | number;
  @Input() autocomplete?: string;
  @Input() describedBy?: string;
  @Input() testId?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  /** Readonly, not disabled: the value stays focusable and selectable, and still submits. */
  @Input({ transform: booleanAttribute }) readonly = false;
  @Input() class = '';

  protected value: string | number | null = '';
  protected disabled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: string | number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  get classes(): string {
    return cx(inputClassName, this.readonly && 'bg-muted cursor-not-allowed', this.class);
  }

  writeValue(value: string | number | null): void {
    this.value = value ?? '';
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    // Keep number inputs numeric so [(ngModel)] bindings behave as they did before.
    this.value = this.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
    this.onChange(this.value);
  }
}
