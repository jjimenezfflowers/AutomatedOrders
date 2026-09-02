import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  LucideAngularModule,
  LucideIconData,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
} from 'lucide-angular';

import { variants } from './variants';

export type AlertVariant = 'info' | 'success' | 'warning' | 'destructive';

/*
 * The admin has no Alert to copy, so this is derived from the semantic tokens:
 * a /10 tint for the surface and /20 for the border, as theme.css prescribes,
 * with body text left on --foreground and only the icon carrying the semantic
 * colour. The card's radius and border weight keep it consistent with ui-card.
 */
export const alertVariants = variants(
  'relative flex w-full items-start gap-3 rounded-lg border p-4 text-sm',
  {
    variants: {
      variant: {
        info: 'border-info/20 bg-info/10',
        success: 'border-success/20 bg-success/10',
        warning: 'border-warning/20 bg-warning/10',
        destructive: 'border-destructive/20 bg-destructive/10',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const ALERT_ICONS: Record<AlertVariant, LucideIconData> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
};

const ALERT_ICON_COLORS: Record<AlertVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

@Component({
  selector: 'ui-alert',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="alert" [class]="classes" [attr.data-testid]="testId">
      <lucide-angular [img]="icon" [class]="iconClasses" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        @if (title) {
          <p class="mb-1 leading-none font-semibold">{{ title }}</p>
        }
        <ng-content />
      </div>
    </div>
  `,
})
export class UiAlertComponent {
  @Input() variant: AlertVariant = 'info';
  @Input() title = '';
  @Input() testId?: string;
  /** Extra utilities merged after the variant classes, for layout only. */
  @Input() class = '';

  get classes(): string {
    return alertVariants({ variant: this.variant }, this.class);
  }

  protected get icon(): LucideIconData {
    return ALERT_ICONS[this.variant];
  }

  protected get iconClasses(): string {
    return `mt-0.5 size-4 shrink-0 ${ALERT_ICON_COLORS[this.variant]}`;
  }
}
