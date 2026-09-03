import { Component } from '@angular/core';

import { LogsComponent } from '../../logs/logs';
import { UiPageComponent } from '../../ui';
import { SECTION_COPY } from '../navigation';

/** Shared section: the same data serves both environments, so the route carries no prefix. */
@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [LogsComponent, UiPageComponent],
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <app-logs />
    </ui-page>
  `,
})
export class LogsPageComponent {
  protected readonly copy = SECTION_COPY['logs'];
}
