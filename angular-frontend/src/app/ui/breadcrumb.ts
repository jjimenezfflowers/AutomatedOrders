import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ChevronRight } from 'lucide-angular';

import { cx } from './variants';

export interface UiCrumb {
  label: string;
  /** Omitted on the last crumb, which is the current page and does not link. */
  link?: string[];
}

/*
 * Class strings from the admin's breadcrumb
 * (bb-remix app/shared/components/ui/breadcrumb.tsx):
 *
 *   list       flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-2.5
 *   item       inline-flex items-center gap-1.5
 *   link       transition-colors hover:text-foreground
 *   page       font-normal text-foreground
 *   separator  [&>svg]:size-3.5
 *
 * The admin renders the trail into its top bar's home slot; this does the same,
 * replacing the bare page title there.
 */
@Component({
  selector: 'ui-breadcrumb',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="breadcrumb" [class]="classes" [attr.data-testid]="testId">
      <ol
        class="flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground sm:gap-2.5"
      >
        @for (crumb of crumbs; track crumb.label; let last = $last) {
          <li class="inline-flex items-center gap-1.5">
            @if (crumb.link && !last) {
              <a
                [routerLink]="crumb.link"
                class="transition-colors hover:text-foreground"
                [attr.data-testid]="testId ? testId + '-link' : null"
              >
                {{ crumb.label }}
              </a>
            } @else {
              <span
                role="link"
                aria-disabled="true"
                aria-current="page"
                class="font-normal text-foreground"
                [attr.data-testid]="testId ? testId + '-current' : null"
              >
                {{ crumb.label }}
              </span>
            }
          </li>

          @if (!last) {
            <li role="presentation" aria-hidden="true" class="[&>svg]:size-3.5">
              <lucide-angular [img]="separator" class="size-3.5" />
            </li>
          }
        }
      </ol>
    </nav>
  `,
})
export class UiBreadcrumbComponent {
  @Input({ required: true }) crumbs: UiCrumb[] = [];
  @Input() testId?: string;
  @Input() class = '';

  protected readonly separator = ChevronRight;

  get classes(): string {
    return cx('min-w-0', this.class);
  }
}
