import { Component, viewChild } from '@angular/core';

import { CustomerComponent } from '../../customer/customer';
import { UiButtonComponent, UiPageComponent } from '../../ui';
import { SECTION_COPY } from '../navigation';

/** Shared section: the same data serves both environments, so the route carries no prefix. */
@Component({
  selector: 'app-customer-page',
  standalone: true,
  imports: [CustomerComponent, UiPageComponent, UiButtonComponent],
  // Not OnPush: the feature components assign plain fields inside HTTP subscriptions
  // without marking themselves dirty, so an OnPush wrapper blocks change detection from
  // reaching them and their lists render empty. Revisit once they are signal-based.
  template: `
    <ui-page [title]="copy.title" [description]="copy.description">
      <ng-container pageActions>
        @if (customer(); as customer) {
          <ui-button
            size="sm"
            (click)="customer.saveCustomerInfo()"
            [loading]="customer.isSaving"
            testId="page-save-customer"
          >
            Save Customer Info
          </ui-button>
        }
      </ng-container>

      <app-customer />
    </ui-page>
  `,
})
export class CustomerPageComponent {
  protected readonly customer = viewChild(CustomerComponent);
  protected readonly copy = SECTION_COPY['customer'];
}
