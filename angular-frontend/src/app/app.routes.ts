import { Routes } from '@angular/router';

import { ENVIRONMENTS, SECTION_COPY } from './shell/navigation';

const BRAND = 'BloomBrain';

/*
 * Sections are lazy so a page only costs what it uses. Products and History pull in
 * TanStack Table, which on its own pushed the initial bundle past its budget; loading
 * them on navigation keeps the shell small and the table's weight on the two pages
 * that need it.
 *
 * Environment-scoped sections live under /dev or /staging so a link carries both the
 * section and the store it targets; shared sections have no prefix because the data
 * is the same either way. Anything unrecognised falls back to the dev catalogue.
 */
const environmentRoutes: Routes = ENVIRONMENTS.flatMap((environment) => [
  {
    path: `${environment.id}/products`,
    loadComponent: () => import('./shell/pages/products-page').then((m) => m.ProductsPageComponent),
    title: `${SECTION_COPY.products.title} · ${environment.label} — ${BRAND}`,
  },
  /*
   * Creating and editing a product used to be component state, so the URL never
   * changed: the back button did nothing, a reload dropped you back on the list,
   * and Cancel was the only way out. They are routes now, which also gives the
   * breadcrumb something real to point at.
   */
  {
    path: `${environment.id}/products/new`,
    loadComponent: () => import('./shell/pages/products-page').then((m) => m.ProductsPageComponent),
    data: { productForm: 'new' },
    title: `New product · ${environment.label} — ${BRAND}`,
  },
  {
    path: `${environment.id}/products/:productId/edit`,
    loadComponent: () => import('./shell/pages/products-page').then((m) => m.ProductsPageComponent),
    data: { productForm: 'edit' },
    title: `Edit product · ${environment.label} — ${BRAND}`,
  },
  {
    path: `${environment.id}/orders`,
    loadComponent: () => import('./shell/pages/orders-page').then((m) => m.OrdersPageComponent),
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
    loadComponent: () => import('./shell/pages/customer-page').then((m) => m.CustomerPageComponent),
    title: `${SECTION_COPY.customer.title} — ${BRAND}`,
  },
  {
    path: 'history',
    loadComponent: () => import('./shell/pages/history-page').then((m) => m.HistoryPageComponent),
    title: `${SECTION_COPY.history.title} — ${BRAND}`,
  },
  {
    path: 'logs',
    loadComponent: () => import('./shell/pages/logs-page').then((m) => m.LogsPageComponent),
    title: `${SECTION_COPY.logs.title} — ${BRAND}`,
  },
  { path: '**', redirectTo: 'dev/products' },
];
