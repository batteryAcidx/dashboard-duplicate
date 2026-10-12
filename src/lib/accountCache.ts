// Remembers the last known company name in memory so pages don't pop in.
// Keyed by login email, so a different login never sees another's name.
// Cleared on sign out and on a full page reload.
let cached: { email: string; companyName: string } | null = null;

export const getCachedCompany = (email: string): string =>
  cached && email && cached.email === email ? cached.companyName : '';

export const setCachedCompany = (email: string, companyName: string): void => {
  if (email && companyName) cached = { email, companyName };
};

export const clearAccountCache = (): void => {
  cached = null;
};