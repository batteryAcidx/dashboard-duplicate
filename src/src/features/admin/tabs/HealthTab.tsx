import React, { useCallback, useState } from 'react';
import { adminApi } from '../../../api';
import { Card, Chip, Notice } from '../../../components/ui';
import { useSynced } from '../../../lib/sync';
import { HEALTH_TEXT, adminErrorText, detectProblems, formatDuration, healthLevel, percent, relativeTime } from '../../../domain/index';
import type { Health, HealthContext } from '../../../domain/index';

const WINDOWS: [number, string][] = [[1, '24 hours'], [7, '7 days'], [30, '30 days']];

const Metric: React.FC<{ label: string; value: string; note?: string; warn?: boolean }> = ({ label, value, note, warn }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-5">
    <div className="text-sm text-slate-400">{label}</div>
    <div className={`mt-2 font-display text-2xl font-bold tracking-tight ${warn ? 'text-red-300' : 'text-slate-100'}`}>{value}</div>
    {note && <div className="mt-1 text-[13px] text-slate-500">{note}</div>}
  </div>
);

export const HealthTab: React.FC<{ accountId: string; onDenied: () => void; initial?: { health: Health; ctx: HealthContext } }> = ({ accountId, onDenied, initial }) => {
  const [health, setHealth] = useState<Health | null>(initial?.health ?? null);
  const [ctx, setCtx] = useState<HealthContext | null>(initial?.ctx ?? null);
  const [days, setDays] = useState(initial?.health.window_days ?? 7);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, c] = await Promise.all([adminApi.health.get(accountId, days), adminApi.controls.get(accountId)]);
    const err = h.error || c.error;
    if (err) {
      if (h.status === 403 || c.status === 403) return onDenied();
      setError(adminErrorText(err));
      return;
    }
    setError(null);
    setHealth(h.data as Health);
    setCtx(c.data as HealthContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, days]);

  useSynced(load, `${accountId}:${days}`);

  if (!health || !ctx) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Checking how the system is doing…'}</p>;

  const problems = detectProblems(health, ctx);
  const level = healthLevel(problems);
  const text = HEALTH_TEXT[level];
  const m = health.messages;
  const ai = health.ai;

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Time window" className="inline-flex rounded-xl border border-white/[0.07] bg-[#090d18] p-1">
          {WINDOWS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${days === d ? 'bg-[#161d30] text-[#ffc174]' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card
        title="How the system is doing"
        hint="Checked automatically from the real activity for this client. Problems are listed worst first."
        action={<Chip tone={text.tone}>{text.label}</Chip>}
      >
        {problems.length === 0 ? (
          <p className="text-[15px] leading-relaxed text-slate-300">{text.line}</p>
        ) : (
          <ul className="space-y-3">
            {problems.map((p) => (
              <li key={p.title} className="flex items-start gap-3.5 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-4">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.level === 'critical' ? 'bg-red-400' : p.level === 'warning' ? 'bg-[#ffc174]' : 'bg-slate-500'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-100">{p.title}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-slate-400">{p.detail}</div>
                </div>
                <Chip tone={p.level === 'critical' ? 'danger' : p.level === 'warning' ? 'gold' : 'plain'}>
                  {p.level === 'critical' ? 'Critical' : p.level === 'warning' ? 'Warning' : 'Info'}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Texts delivered" value={percent(m.delivered, m.outbound)} note={`${m.outbound} sent, ${m.failed} failed`} warn={m.failed > 0} />
        <Metric label="Average first reply" value={formatDuration(health.response.avg_seconds)} note={health.response.measured ? `from ${health.response.measured} conversations` : 'No data yet'} />
        <Metric label="Conversations" value={String(health.conversations.started)} note={`${health.conversations.booked} booked, ${health.conversations.handed_off} handed to the owner`} />
        <Metric label="Owner alerts" value={String(health.alerts.sent)} note={`${health.alerts.failed} failed`} warn={health.alerts.failed > 0} />
        <Metric label="AI replies" value={String(ai.calls)} note={`${ai.errors} errors, ${ai.fallbacks} fallbacks`} warn={ai.errors > 0} />
        <Metric label="AI speed" value={ai.calls ? `${(ai.avg_latency_ms / 1000).toFixed(1)}s` : '—'} note="Average time to write a reply" />
        <Metric label="Waiting" value={String(health.engine.pending)} note="Texts queued to be handled" warn={health.engine.pending > 20} />
        <Metric label="Failed to process" value={String(health.engine.failed)} note="Incoming texts that errored" warn={health.engine.failed > 0} />
      </div>

      <Card title="Last activity">
        <div className="flex items-start justify-between gap-6 text-sm">
          <span className="text-slate-400">Last text from a homeowner</span>
          <span className="font-medium text-slate-100">{relativeTime(health.engine.last_inbound_at)}</span>
        </div>
        <div className="flex items-start justify-between gap-6 text-sm">
          <span className="text-slate-400">Last text we sent</span>
          <span className="font-medium text-slate-100">{relativeTime(health.engine.last_outbound_at)}</span>
        </div>
        <div className="flex items-start justify-between gap-6 text-sm">
          <span className="text-slate-400">Weather</span>
          <span className="font-medium text-slate-100">{health.weather.last_error ? 'Not updating' : health.weather.storm_mode ? 'Storm mode' : 'Clear'}</span>
        </div>
      </Card>

      <Card title="Recent errors" hint="What went wrong in this period, newest first.">
        {health.recent_errors.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing went wrong in this period.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {health.recent_errors.map((e, i) => (
              <li key={`${e.at}-${i}`} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[15px] font-semibold text-slate-100">{e.kind}</span>
                  <span className="text-xs text-slate-500">{relativeTime(e.at)}</span>
                </div>
                {e.detail && <p className="mt-1 break-words text-sm text-slate-400">{e.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
