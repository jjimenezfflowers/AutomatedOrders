import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { cx } from './variants';

/*
 * The admin's page header (bb-remix, every index route):
 *
 *   <h1 className="text-xl font-semibold">Orders</h1>
 *   <div className="flex items-center justify-between pb-4">
 *     <p className="text-gray-600">List of incoming orders…</p>
 *     <OrdersMA />        // actions, right-aligned on the description row
 *   </div>
 *
 * The title sits above a row holding the description on the left and the page's
 * actions on the right, then the content. Page padding and rhythm come from the
 * shell, so this component only owns the header block.
 */
@Component({
  selector: 'ui-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>

    <div class="flex items-center justify-between gap-4 pb-4">
      @if (description) {
        <p class="text-sm text-muted-foreground">{{ description }}</p>
      } @else {
        <span></span>
      }
      <div class="flex shrink-0 items-center gap-2">
        <ng-content select="[pageActions]" />
      </div>
    </div>

    <div [class]="contentClasses">
      <ng-content />
    </div>
  `,
})
export class UiPageComponent {
  @Input({ required: true }) title!: string;
  @Input() description?: string;
  @Input() class = '';

  get contentClasses(): string {
    return cx('flex flex-col gap-y-4', this.class);
  }
}
