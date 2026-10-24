// Where people can go (tabs and the account menu), and how an address is read. Pure.
// The admin's menu never offers the page you are on. The client's pages are tabs, with the current one lit up.

export interface MenuItem {
  key: string;
  label: string;
  path: string;
  /** shown in the gold "admin" colour */
  accent?: boolean;
}

/* ---------------------------------------------------------------- the client's tabs and menu */

export type OwnerPage = 'dashboard' | 'contacts' | 'settings' | 'setup' | 'registration';

export interface OwnerTab {
  page: Exclude<OwnerPage, 'registration'>;
  label: string;
  path: string;
}

/**
 * The client's main pages, as tabs: along the top on a computer, along the bottom on a phone.
 * "Setup" is only there while the account is still being set up.
 */
export function ownerTabs(showSetup: boolean): OwnerTab[] {
  const tabs: OwnerTab[] = [{ page: 'dashboard', label: 'Dashboard', path: '/queue' }];
  if (showSetup) tabs.push({ page: 'setup', label: 'Setup', path: '/setup' });
  tabs.push({ page: 'contacts', label: 'Contacts', path: '/contacts' }, { page: 'settings', label: 'Settings', path: '/settings' });
  return tabs;
}

/** Which tab is lit up. The registration form is part of setup, so it lights up Setup. */
export const activeOwnerTab = (current: OwnerPage | undefined): OwnerTab['page'] | undefined => (current === 'registration' ? 'setup' : current);

/** The account menu holds what is not a page: a way back to the admin, for admins. (Sign out is separate.) */
export function ownerMenu(isAdmin: boolean): MenuItem[] {
  return isAdmin ? [{ key: 'admin', label: 'Admin', path: '/admin', accent: true }] : [];
}

/* ---------------------------------------------------------------- the admin's menu */

export type AdminSection = 'clients' | 'territories' | 'integrations' | 'settings' | 'wiki';

/**
 * Clients and Territories are always in the bar at the top, so they are not here.
 * Everything else lives in the account menu, minus the page you are on.
 * (There is no link to the client dashboard: the admin is a different place.)
 */
export function adminMenu(section: AdminSection): MenuItem[] {
  const all: (MenuItem & { section?: AdminSection })[] = [
    { key: 'integrations', section: 'integrations', label: 'Integrations', path: '/admin/integrations' },
    { key: 'wiki', section: 'wiki', label: 'Wiki', path: '/admin/wiki' },
    { key: 'settings', section: 'settings', label: 'Settings', path: '/admin/settings' },
  ];
  return all.filter((i) => i.section !== section).map(({ section: _s, ...rest }) => rest);
}

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
