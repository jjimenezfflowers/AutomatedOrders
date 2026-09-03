import { LucideIconData, Boxes, ClipboardList, ScrollText, User, History } from 'lucide-angular';

export type Environment = 'dev' | 'staging';
export type SectionId = 'products' | 'orders' | 'customer' | 'history' | 'logs';

export interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIconData;
  /**
   * Environment-scoped sections render against whichever store is selected;
   * the rest are shared, which is why the menu no longer duplicates them.
   */
  scoped: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Pushed to the bottom of the sidebar, as the admin does with its System group. */
  footer?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { id: 'products', label: 'Products', icon: Boxes, scoped: true },
      { id: 'orders', label: 'Orders', icon: ClipboardList, scoped: true },
    ],
  },
  {
    label: 'Shared',
    items: [
      { id: 'customer', label: 'Customer Info', icon: User, scoped: false },
      { id: 'history', label: 'History', icon: History, scoped: false },
    ],
  },
  {
    label: 'System',
    footer: true,
    items: [{ id: 'logs', label: 'Logs', icon: ScrollText, scoped: false }],
  },
];

export const ENVIRONMENTS: { id: Environment; label: string; store: string }[] = [
  { id: 'dev', label: 'DEV', store: 'bloom-brain-dev' },
  { id: 'staging', label: 'STAGING', store: 'bloom-brain-stage' },
];

/** Page title and the one-line description under it, following the admin's page header. */
export const SECTION_COPY: Record<SectionId, { title: string; description: string }> = {
  products: {
    title: 'Products',
    description: 'Catalogue the automated runs order from, with their selectors and variants.',
  },
  orders: {
    title: 'Orders',
    description: 'Build an order and place it against the storefront.',
  },
  customer: {
    title: 'Customer Info',
    description: 'Customer and payment details used by every run, in both environments.',
  },
  history: {
    title: 'History',
    description: 'Orders placed by automated runs.',
  },
  logs: {
    title: 'Logs',
    description: 'Server activity and Playwright output, held in memory.',
  },
};

export function sectionById(id: SectionId): NavItem | undefined {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === id);
}

export function isEnvironment(value: string | undefined): value is Environment {
  return ENVIRONMENTS.some((item) => item.id === value);
}
