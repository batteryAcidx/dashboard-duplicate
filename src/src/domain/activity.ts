// The admin activity log: readable action names, paging, and the filters.

const ACTION_LABEL: Record<string, string> = {
  engine_on: 'Engine turned on',
  engine_off: 'Engine turned off',
  engine_controls_changed: 'Controls changed',
  engine_retry_failed: 'Failed texts retried',
  calendar_set: 'Calendar connection changed',
  calendar_sync_requested: 'Calendar sync requested',
  calendar_disconnected: 'Calendar disconnected',
  billing_changed: 'Billing details changed',
  stripe_linked: 'Stripe customer linked',
  legacy_ghl_changed: 'Legacy GHL changed',
  set_status: 'Account status changed',
  update_step: 'Setup step updated',
};

/** "engine_on" becomes "Engine turned on". Anything unknown is made readable instead of shown raw. */
export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const t = action.replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Action';
}

export interface PageInfo {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageInfo(total: number, offset: number, limit: number): PageInfo {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.floor(offset / limit) + 1);
  return {
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(total, offset + limit),
    total,
    page,
    pages,
    hasPrev: offset > 0,
    hasNext: offset + limit < total,
  };
}

export interface ActivityFilters {
  from: string;   // YYYY-MM-DD or ''
  to: string;     // YYYY-MM-DD or '', inclusive
  actor: string;  // admin user id or ''
  action: string; // '' for all
  search: string;
}

export const EMPTY_FILTERS: ActivityFilters = { from: '', to: '', actor: '', action: '', search: '' };

export function filtersActive(f: ActivityFilters): boolean {
  return Boolean(f.from || f.to || f.actor || f.action || f.search.trim());
}

/** The arguments for the admin_activity_list function. The "to" day is included in full. */
export function activityArgs(accountId: string, f: ActivityFilters, offset: number, limit: number): Record<string, unknown> {
  const start = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
  const endExclusive = (d: string) => {
    if (!d) return null;
    const x = new Date(`${d}T00:00:00`);
    x.setDate(x.getDate() + 1);
    return x.toISOString();
  };
  return {
    p_account_id: accountId,
    p_from: start(f.from),
    p_to: endExclusive(f.to),
    p_actor: f.actor || null,
    p_action: f.action || null,
    p_search: f.search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  };
}

/* ---------------------------------------------------------------- how the system is performing */

