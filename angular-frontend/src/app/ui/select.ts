import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  ViewChild,
  booleanAttribute,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { variants } from './variants';

export type UiSelectSize = 'sm' | 'default';

export interface UiSelectOption {
  value: string;
  label: string;
}

/*
 * From the admin's SelectTrigger (bb-remix app/shared/components/ui/select.tsx).
 * The admin renders a Radix trigger + popover; a native <select> is used here so
 * the app keeps its existing keyboard, mobile and [(ngModel)] behaviour, but the
 * trigger's class string is reproduced so the two look identical side by side.
 *
 * Two deliberate departures:
 *  - the trigger's `outline-none` is omitted, for the same reason button.ts and
 *    input.ts omit theirs: it removes the focus ring without replacing it, and it
 *    would beat the global :focus-visible rule in styles.css.
 * The admin's trigger is a Base UI button, which sizes to its content; ours is a
 * native <select>, and setting py-2 alongside a fixed h-8 left 16px of box for
 * 14px text, clipping descenders. The height carries the sizing and the browser
 * centres the text, so the vertical padding goes.
 *
 *  - height comes from `data-[size=...]` (as upstream), so the size input is
 *    rendered as a data attribute rather than a swapped class.
 */
export const selectVariants = variants(
  'flex w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent ' +
    'py-0 pr-2 pl-2.5 text-sm leading-none whitespace-nowrap shadow-xs transition-[color,box-shadow] ' +
    'disabled:cursor-not-allowed disabled:opacity-50 ' +
    'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 ' +
    'data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8',
  {
    variants: { size: { sm: '', default: '' } },
    defaultVariants: { size: 'default' },
  },
);

@Component({
  selector: 'ui-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSelectComponent),
      multi: true,
    },
  ],
  template: `
    <select
      #select
      [class]="classes"
      [disabled]="disabled"
      [attr.id]="inputId"
      [attr.name]="name"
      [attr.data-size]="size"
      [attr.data-placeholder]="isPlaceholder ? '' : null"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy"
      [attr.data-testid]="testId"
      (change)="onSelect($event)"
      (blur)="onTouched()"
    >
      @if (placeholder) {
        <option value="">{{ placeholder }}</option>
      }
      @for (option of options; track option.value) {
        <option [value]="option.value">{{ option.label }}</option>
      }
      <ng-content />
    </select>
  `,
})
export class UiSelectComponent implements ControlValueAccessor, AfterViewChecked {
  @Input() options: UiSelectOption[] = [];
  @Input() placeholder = '';
  @Input() size: UiSelectSize = 'default';
  @Input() inputId?: string;
  @Input() name?: string;
  @Input() describedBy?: string;
  @Input() testId?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  /** Extra utilities merged after the variant classes, for layout only. */
  @Input() class = '';

  @ViewChild('select', { static: true })
  private readonly selectRef!: ElementRef<HTMLSelectElement>;

  protected value = '';
  protected disabled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  get classes(): string {
    return selectVariants({ size: this.size }, this.class);
  }

  protected get isPlaceholder(): boolean {
    return this.value === '';
  }

  /*
   * A [value] binding on the <select> is evaluated before @for creates the
   * <option>s (and before projected content settles), so the browser would drop
   * it. Writing the DOM value after the view is checked is what makes both the
   * `options` array and caller-supplied <option>s honour writeValue().
   */
  ngAfterViewChecked(): void {
    const element = this.selectRef.nativeElement;
    if (element.value !== this.value) {
      element.value = this.value;
    }
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

  protected onSelect(event: Event): void {
    this.value = (event.target as HTMLSelectElement).value;
    this.onChange(this.value);
  }
}
