// Where people can go from the account menu, and how an address is read. Pure.
// One rule for everyone: the menu never offers the page you are already on.

export interface MenuItem {
  key: string;
  label: string;
  path: string;
  /** shown in the gold "admin" colour */
  accent?: boolean;
}

/* ---------------------------------------------------------------- the client's menu */

export type OwnerPage = 'dashboard' | 'contacts' | 'settings' | 'setup' | 'registration';

const OWNER_ITEMS: (MenuItem & { page: OwnerPage })[] = [
  { key: 'dashboard', page: 'dashboard', label: 'Dashboard', path: '/queue' },
  { key: 'contacts', page: 'contacts', label: 'Contacts', path: '/contacts' },
  { key: 'settings', page: 'settings', label: 'Settings', path: '/settings' },
];

/** The client's menu items (sign out is separate). The page you are on is left out. Admins also get a way back to the admin. */
export function ownerMenu(current: OwnerPage | undefined, isAdmin: boolean): MenuItem[] {
  const items: MenuItem[] = OWNER_ITEMS.filter((i) => i.page !== current).map(({ page: _page, ...rest }) => rest);
  if (isAdmin) items.push({ key: 'admin', label: 'Admin', path: '/admin', accent: true });
  return items;
}

/* ---------------------------------------------------------------- the admin's menu */

export type AdminSection = 'clients' | 'territories' | 'integrations' | 'settings' | 'wiki';

/**
 * Clients and Territories are always in the bar at the top, so they are not here.
 * Everything else lives in the account menu, minus the page you are on.
 */
export function adminMenu(section: AdminSection): MenuItem[] {
  const all: (MenuItem & { section?: AdminSection })[] = [
    { key: 'integrations', section: 'integrations', label: 'Integrations', path: '/admin/integrations' },
    { key: 'settings', section: 'settings', label: 'Settings', path: '/admin/settings' },
    { key: 'client-dashboard', label: 'Client dashboard', path: '/queue' },
  ];
  return all.filter((i) => i.section !== section).map(({ section: _s, ...rest }) => rest);
}

/** The small link at the bottom of every admin page. Hidden on the Wiki itself. */
export const showWikiLink = (section: AdminSection): boolean => section !== 'wiki';

/* ---------------------------------------------------------------- reading an address */

export interface Target {
  path: string;
  search: string;
  hash: string;
}

/**
 * "/admin/wiki?x=1#stripe" becomes its three parts. The path must never carry the "#..." part:
 * that is how "wiki#stripe" once got read as a client's name.
 */
export function parseTarget(to: string): Target {
  const hashAt = to.indexOf('#');
  const beforeHash = hashAt === -1 ? to : to.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : to.slice(hashAt);
  const qAt = beforeHash.indexOf('?');
  const path = (qAt === -1 ? beforeHash : beforeHash.slice(0, qAt)).trim() || '/';
  const search = qAt === -1 ? '' : beforeHash.slice(qAt);
  return { path, search, hash: hash === '#' ? '' : hash };
}
