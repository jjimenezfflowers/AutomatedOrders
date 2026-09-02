import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { variants } from './variants';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline';

/*
 * The admin has no Badge to copy, so this is derived from the semantic tokens the
 * way theme.css prescribes: solid colours rendered as tints via opacity
 * (`bg-success/10 text-success`) rather than hardcoded pastel hexes. `rounded-sm`
 * is the radius the token scale assigns to badges/chips/tags.
 */
export const badgeVariants = variants(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-sm border px-2 py-0.5 ' +
    'text-xs font-semibold whitespace-nowrap ' +
    '[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="classes" [attr.data-testid]="testId">
      <ng-content />
    </span>
  `,
})
export class UiBadgeComponent {
  @Input() variant: BadgeVariant = 'default';
  @Input() testId?: string;
  /** Extra utilities merged after the variant classes, for layout only. */
  @Input() class = '';

  get classes(): string {
    return badgeVariants({ variant: this.variant }, this.class);
  }
}
