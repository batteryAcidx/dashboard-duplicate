// How the system is performing for a client, and what is wrong. Pure: the numbers go in, the problems come out.

export interface Health {
  window_days: number;
  messages: { inbound: number; outbound: number; delivered: number; failed: number; queued: number };
  conversations: { started: number; booked: number; handed_off: number; opted_out: number };
  response: { avg_seconds: number; slowest_seconds: number; measured: number };
  ai: { calls: number; errors: number; fallbacks: number; blocked: number; avg_latency_ms: number; input_tokens: number; output_tokens: number };
  engine: { pending: number; failed: number; last_inbound_at: string | null; last_outbound_at: string | null };
  alerts: { sent: number; failed: number; pending: number };
  calendar: { status: string; last_synced_at: string | null; failed_writes: number };
  weather: { last_error: string | null; fetched_at: string | null; storm_mode: boolean };
  recent_errors: { at: string; kind: string; detail: string }[];
}

export interface HealthContext {
  engine_enabled: boolean;
  test_mode?: boolean;
  paused_until?: string | null;
  forwarding_status?: string | null;
  registration_status?: string | null;
}

export type ProblemLevel = 'critical' | 'warning' | 'info';

export interface Problem {
  level: ProblemLevel;
  title: string;
  detail: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const LEVEL_ORDER: Record<ProblemLevel, number> = { critical: 0, warning: 1, info: 2 };

/** Turns the raw numbers into a short list of what to look at, worst first. */
export function detectProblems(h: Health, c: HealthContext, now: number = Date.now()): Problem[] {
  const out: Problem[] = [];
  const on = c.engine_enabled;
  const paused = Boolean(c.paused_until && new Date(c.paused_until).getTime() > now);

  if (!on) out.push({ level: 'info', title: 'The engine is off', detail: 'No texts are being sent for this client.' });
  if (on && paused) out.push({ level: 'info', title: 'The engine is paused', detail: 'Texting resumes when the pause ends.' });
  if (on && c.test_mode) out.push({ level: 'info', title: 'Test mode is on', detail: 'Only the owner is being texted, not real homeowners.' });

  if (on && c.forwarding_status !== 'verified') {
    out.push({ level: 'critical', title: 'Call forwarding is not verified', detail: 'Missed calls may not be reaching the engine.' });
  }
  if (on && c.registration_status !== 'approved') {
    out.push({ level: 'critical', title: 'The texting registration is not approved', detail: 'Carriers may block these texts.' });
  }

  const m = h.messages;
  if (m.failed > 0) {
    const rate = m.outbound > 0 ? m.failed / m.outbound : 1;
    out.push({
      level: rate >= 0.05 || m.failed >= 5 ? 'critical' : 'warning',
      title: `${plural(m.failed, 'text was', 'texts were')} not delivered`,
      detail: `${Math.round(rate * 100)}% of the texts sent in this period failed to reach the phone.`,
    });
  }

  if (h.alerts.failed > 0) {
    out.push({
      level: 'critical',
      title: 'The owner is not being told',
      detail: `${plural(h.alerts.failed, 'alert text', 'alert texts')} to the owner failed to send.`,
    });
  }

  if (h.engine.failed > 0) {
    out.push({
      level: h.engine.failed >= 5 ? 'critical' : 'warning',
      title: `${plural(h.engine.failed, 'incoming text', 'incoming texts')} could not be processed`,
      detail: 'A homeowner may be waiting for a reply. You can retry them from Controls.',
    });
  }
  if (h.engine.pending > 20) {
    out.push({ level: 'warning', title: 'Texts are piling up', detail: `${h.engine.pending} are waiting to be handled.` });
  }

  if (h.ai.calls >= 10) {
    const bad = h.ai.errors + h.ai.fallbacks;
    if (h.ai.errors / h.ai.calls >= 0.1) {
      out.push({ level: 'critical', title: 'The AI is failing often', detail: `${h.ai.errors} of ${h.ai.calls} AI calls errored.` });
    } else if (bad / h.ai.calls >= 0.2) {
      out.push({ level: 'warning', title: 'The AI is falling back to fixed messages', detail: `${bad} of ${h.ai.calls} replies used a fallback or errored.` });
    }
    if (h.ai.blocked / h.ai.calls >= 0.3) {
      out.push({ level: 'warning', title: 'Many replies are blocked by the safety checks', detail: `${h.ai.blocked} of ${h.ai.calls} were blocked. The prompt may need attention.` });
    }
  }

  if (h.response.measured >= 3 && h.response.avg_seconds > 120) {
    out.push({ level: 'warning', title: 'First replies are slow', detail: `Average first reply took ${Math.round(h.response.avg_seconds / 60)} minutes.` });
  }

  if (on && h.conversations.started > 0 && m.outbound === 0) {
    out.push({ level: 'warning', title: 'Missed calls came in but no texts went out', detail: 'Check that the engine is on, not paused, and the number is connected.' });
  }

  if (h.calendar.status === 'needs_reauth') {
    out.push({ level: 'warning', title: 'The calendar needs the owner to sign in again', detail: 'Booked times are not being checked against their calendar.' });
  } else if (h.calendar.status === 'error') {
    out.push({ level: 'warning', title: 'The calendar connection has an error', detail: 'Open the Calendar tab to see the last error.' });
  }
  if (h.calendar.failed_writes > 0) {
    out.push({ level: 'warning', title: `${plural(h.calendar.failed_writes, 'booking', 'bookings')} could not be written to the calendar`, detail: 'The inspection exists, but it is not on the owner\'s calendar.' });
  }

  if (h.weather.last_error) {
    out.push({ level: 'info', title: 'Weather alerts are not updating', detail: h.weather.last_error });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export type HealthLevel = 'healthy' | 'attention' | 'problem';

export function healthLevel(problems: Problem[]): HealthLevel {
  if (problems.some((p) => p.level === 'critical')) return 'problem';
  if (problems.some((p) => p.level === 'warning')) return 'attention';
  return 'healthy';
}

export const HEALTH_TEXT: Record<HealthLevel, { label: string; tone: 'ok' | 'gold' | 'danger'; line: string }> = {
  healthy: { label: 'Healthy', tone: 'ok', line: 'Nothing needs your attention.' },
  attention: { label: 'Needs attention', tone: 'gold', line: 'A few things are worth a look.' },
  problem: { label: 'Problem', tone: 'danger', line: 'Something is wrong and may be costing this client leads.' },
};

