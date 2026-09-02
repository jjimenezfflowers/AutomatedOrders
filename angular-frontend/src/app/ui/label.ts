import { ChangeDetectionStrategy, Component, Input, booleanAttribute } from '@angular/core';

import { cx } from './variants';

/*
 * The admin's Label is `text-xs leading-none font-semibold` — not the more common
 * `text-sm font-medium`. That smaller, heavier label is a defining detail of the
 * admin's form density, so it is reproduced exactly
 * (bb-remix app/shared/components/ui/label.tsx).
 */
export const labelClassName =
  'text-xs leading-none font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-70';

@Component({
  selector: 'ui-label',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [attr.for]="for" [class]="classes">
      <ng-content />
    </label>
  `,
})
export class UiLabelComponent {
  @Input() for?: string;
  @Input({ transform: booleanAttribute }) invalid = false;
  @Input() class = '';

  get classes(): string {
    return cx(labelClassName, this.invalid && 'text-destructive', this.class);
  }
}
