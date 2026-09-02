import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LogsComponent } from '../../logs/logs';
import { UiPageComponent } from '../../ui';
import { SECTION_COPY } from '../navigation';

/** Shared section: the same data serves both environments, so the route carries no prefix. */
@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [LogsComponent, UiPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <app-logs />
    </ui-page>
  `,
})
export class LogsPageComponent {
  protected readonly copy = SECTION_COPY['logs'];
}
