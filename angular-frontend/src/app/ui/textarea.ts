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
 * `inputClassName` from input.ts with the fixed h-9 traded for a min-height and
 * matching vertical padding, so a textarea can grow while sharing the input's
 * border, radius, shadow and invalid treatment. As with the input, the admin's
 * `focus-visible:outline-hidden` is not carried over.
 */
export const textareaClassName =
  'flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm/tight shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';

@Component({
  selector: 'ui-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiTextareaComponent),
      multi: true,
    },
  ],
  template: `
    <textarea
      [class]="classes"
      [value]="value"
      [placeholder]="placeholder"
      [disabled]="disabled"
      [rows]="rows"
      [attr.id]="inputId"
      [attr.name]="name"
      [attr.autocomplete]="autocomplete"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy"
      [attr.data-testid]="testId"
      (input)="onInput($event)"
      (blur)="onTouched()"
    ></textarea>
  `,
})
export class UiTextareaComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() rows = 3;
  @Input() inputId?: string;
  @Input() name?: string;
  @Input() autocomplete?: string;
  @Input() describedBy?: string;
  @Input() testId?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  /** Extra utilities merged after the base classes, for layout only. */
  @Input() class = '';

  protected value = '';
  protected disabled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  get classes(): string {
    return cx(textareaClassName, this.class);
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
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
    this.cdr.markForCheck();
  }

  protected onInput(event: Event): void {
    this.value = (event.target as HTMLTextAreaElement).value;
    this.onChange(this.value);
  }
}
