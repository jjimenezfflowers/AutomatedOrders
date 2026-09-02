import { ChangeDetectionStrategy, Component } from '@angular/core';

import { HistoryComponent } from '../../history/history';
import { UiPageComponent } from '../../ui';
import { SECTION_COPY } from '../navigation';

/** Shared section: the same data serves both environments, so the route carries no prefix. */
@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [HistoryComponent, UiPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <app-history />
    </ui-page>
  `,
})
export class HistoryPageComponent {
  protected readonly copy = SECTION_COPY['history'];
}
