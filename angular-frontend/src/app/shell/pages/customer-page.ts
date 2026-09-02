import { Component } from '@angular/core';

import { CustomerComponent } from '../../customer/customer';
import { UiPageComponent } from '../../ui';
import { SECTION_COPY } from '../navigation';

/** Shared section: the same data serves both environments, so the route carries no prefix. */
@Component({
  selector: 'app-customer-page',
  standalone: true,
  imports: [CustomerComponent, UiPageComponent],
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <app-customer />
    </ui-page>
  `,
})
export class CustomerPageComponent {
  protected readonly copy = SECTION_COPY['customer'];
}
