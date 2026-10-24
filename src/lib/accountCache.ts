// Remembers the last known company name, and whether setup is still going on, in memory so pages don't pop in.
// Keyed by login email, so a different login never sees another's. Cleared on sign out and on a full page reload.
let cached: { email: string; companyName: string } | null = null;
let setup: { email: string; active: boolean } | null = null;

export const getCachedCompany = (email: string): string =>
  cached && email && cached.email === email ? cached.companyName : '';

export const setCachedCompany = (email: string, companyName: string): void => {
  if (email && companyName) cached = { email, companyName };
};

/** Is this account still being set up? Decides whether the Setup tab shows on pages that do not load the account's status. */
export const getCachedSetup = (email: string): boolean => Boolean(setup && email && setup.email === email && setup.active);

export const setCachedSetup = (email: string, active: boolean): void => {
  if (email) setup = { email, active };
};

export const clearAccountCache = (): void => {
  cached = null;
  setup = null;
};
