import { Routes } from '@angular/router';

import { CustomerPageComponent } from './shell/pages/customer-page';
import { HistoryPageComponent } from './shell/pages/history-page';
import { LogsPageComponent } from './shell/pages/logs-page';
import { OrdersPageComponent } from './shell/pages/orders-page';
import { ProductsPageComponent } from './shell/pages/products-page';
import { ENVIRONMENTS, SECTION_COPY } from './shell/navigation';

const BRAND = 'BloomBrain';

/*
 * Environment-scoped sections live under /dev or /staging so a link carries both the
 * section and the store it targets; shared sections have no prefix because the data
 * is the same either way. Anything unrecognised falls back to the dev catalogue.
 */
const environmentRoutes: Routes = ENVIRONMENTS.flatMap((environment) => [
  {
    path: `${environment.id}/products`,
    component: ProductsPageComponent,
    title: `${SECTION_COPY.products.title} · ${environment.label} — ${BRAND}`,
  },
  {
    path: `${environment.id}/orders`,
    component: OrdersPageComponent,
    title: `${SECTION_COPY.orders.title} · ${environment.label} — ${BRAND}`,
  },
  // Bare /dev or /staging lands on that store's catalogue.
  { path: environment.id, redirectTo: `${environment.id}/products`, pathMatch: 'full' as const },
]);

export const routes: Routes = [
  { path: '', redirectTo: 'dev/products', pathMatch: 'full' },
  ...environmentRoutes,
  {
    path: 'customer',
    component: CustomerPageComponent,
    title: `${SECTION_COPY.customer.title} — ${BRAND}`,
  },
  {
    path: 'history',
    component: HistoryPageComponent,
    title: `${SECTION_COPY.history.title} — ${BRAND}`,
  },
  { path: 'logs', component: LogsPageComponent, title: `${SECTION_COPY.logs.title} — ${BRAND}` },
  { path: '**', redirectTo: 'dev/products' },
];
