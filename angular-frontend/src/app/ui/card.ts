import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { cx } from './variants';

/*
 * The admin's Card family (bb-remix app/shared/components/ui/card.tsx), one
 * component per part. Each takes only a `class` passthrough, so composition
 * stays in the caller's template rather than behind configuration inputs:
 *
 *   <ui-card>
 *     <ui-card-header>
 *       <ui-card-title>Orders</ui-card-title>
 *       <ui-card-description>Queued for submission</ui-card-description>
 *     </ui-card-header>
 *     <ui-card-content>…</ui-card-content>
 *     <ui-card-footer>…</ui-card-footer>
 *   </ui-card>
 */
export const cardClassName = 'rounded-xl border bg-card text-card-foreground shadow-sm';
export const cardHeaderClassName = 'flex flex-col space-y-1.5 p-6';
export const cardTitleClassName = 'leading-none font-semibold tracking-tight';
export const cardDescriptionClassName = 'text-sm text-muted-foreground';
export const cardContentClassName = 'p-6';
export const cardFooterClassName = 'flex items-center p-6 pt-0';

@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes" [attr.data-testid]="testId">
      <ng-content />
    </div>
  `,
})
export class UiCardComponent {
  @Input() testId?: string;
  /** Extra utilities merged after the base classes, for layout only. */
  @Input() class = '';

  get classes(): string {
    return cx(cardClassName, this.class);
  }
}

@Component({
  selector: 'ui-card-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes">
      <ng-content />
    </div>
  `,
})
export class UiCardHeaderComponent {
  @Input() class = '';

  get classes(): string {
    return cx(cardHeaderClassName, this.class);
  }
}

@Component({
  selector: 'ui-card-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 [class]="classes">
      <ng-content />
    </h3>
  `,
})
export class UiCardTitleComponent {
  @Input() class = '';

  get classes(): string {
    return cx(cardTitleClassName, this.class);
  }
}

@Component({
  selector: 'ui-card-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p [class]="classes">
      <ng-content />
    </p>
  `,
})
export class UiCardDescriptionComponent {
  @Input() class = '';

  get classes(): string {
    return cx(cardDescriptionClassName, this.class);
  }
}

@Component({
  selector: 'ui-card-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes">
      <ng-content />
    </div>
  `,
})
export class UiCardContentComponent {
  @Input() class = '';

  get classes(): string {
    return cx(cardContentClassName, this.class);
  }
}

@Component({
  selector: 'ui-card-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="classes">
      <ng-content />
    </div>
  `,
})
export class UiCardFooterComponent {
  @Input() class = '';

  get classes(): string {
    return cx(cardFooterClassName, this.class);
  }
}

/** Every part of the card, for `imports:` in a consuming component. */
export const UI_CARD = [
  UiCardComponent,
  UiCardHeaderComponent,
  UiCardTitleComponent,
  UiCardDescriptionComponent,
  UiCardContentComponent,
  UiCardFooterComponent,
] as const;
