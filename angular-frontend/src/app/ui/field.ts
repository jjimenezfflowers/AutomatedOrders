import { ChangeDetectionStrategy, Component, Input, booleanAttribute } from '@angular/core';

import { UiLabelComponent } from './label';
import { cx } from './variants';

let nextFieldId = 0;

/*
 * The label + control + message wrapper, following the admin's composed field
 * (bb-remix app/shared/components/ui/form/form-input.tsx):
 *
 *   FormItem      flex w-full flex-col gap-y-2
 *   label row     flex h-4 w-full items-center justify-between   (optional marker right-aligned)
 *   FormMessage   text-[0.8rem] font-medium text-destructive
 *
 * The control is projected, so this works with any ui-* control or a plain element.
 * `controlId` is generated when not supplied so the label's `for` always resolves.
 */
@Component({
  selector: 'ui-field',
  standalone: true,
  imports: [UiLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes">
      @if (label) {
        <div class="flex h-4 w-full items-center justify-between">
          <ui-label [for]="controlId" [invalid]="!!error">{{ label }}</ui-label>
          @if (optional) {
            <div class="text-xs text-gray-400">optional</div>
          }
        </div>
      }

      <ng-content />

      @if (error) {
        <p class="text-[0.8rem] font-medium text-destructive" [attr.id]="controlId + '-error'" role="alert">
          {{ error }}
        </p>
      } @else if (hint) {
        <p class="text-[0.8rem] text-muted-foreground" [attr.id]="controlId + '-hint'">{{ hint }}</p>
      }
    </div>
  `,
})
export class UiFieldComponent {
  @Input() label?: string;
  @Input() hint?: string;
  @Input() error?: string | null;
  @Input({ transform: booleanAttribute }) optional = false;
  @Input() class = '';

  /** Shared by the label's `for` and the message ids; generated when not given. */
  @Input() controlId = `ui-field-${nextFieldId++}`;

  get classes(): string {
    return cx('flex w-full flex-col gap-y-2', this.class);
  }
}
