import React, { useCallback, useEffect, useState } from 'react';
import { integrationsApi } from '../../../api';
import { Button, Card, Chip, Notice, Row } from '../../../components/ui';
import { useSynced, useSync } from '../../../lib/sync';
import { NotPluggedIn, useIntegration } from '../../../integrations';
import { adminErrorText, relativeTime } from '../../../domain/index';
import type { Cal } from '../../../domain/index';

const STATUS_TEXT: Record<string, { label: string; tone: 'ok' | 'gold' | 'danger' | 'plain' }> = {
  active: { label: 'Connected', tone: 'ok' },
  needs_reauth: { label: 'Needs to reconnect', tone: 'gold' },
  error: { label: 'Error', tone: 'danger' },
  not_connected: { label: 'Not connected', tone: 'plain' },
};

export const CalendarTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Cal }> = ({ accountId, onDenied, initial }) => {
  const [cal, setCal] = useState<Cal | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sync = useSync();
  const google = useIntegration('google_calendar');

  const load = useCallback(async () => {
    const r = await integrationsApi.googleCalendar.status(accountId);
    if (r.error) {
      if (r.status === 403) return onDenied();
      setError(adminErrorText(r.error));
      return;
    }
    setError(null);
    setCal(r.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useSynced(load, accountId);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 5000);
  };

  const runSync = useCallback(async (quiet = false) => {
    setBusy('sync');
    if (!quiet) setError(null);
    const r = await integrationsApi.googleCalendar.sync(accountId);
    setBusy(null);
    if (r.error) {
      setError(r.error);
    } else if (!quiet) flash('Synced with the calendar.');
    await load();
    sync?.syncAll();
  }, [accountId, load, sync]);

  // Google sends the person back here with ?calendar=connected or ?calendar=error
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get('calendar');
    if (!result) return;
    url.searchParams.delete('calendar');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
    if (result === 'connected') {
      flash('Google Calendar connected. Running the first sync…');
      runSync(true);
    } else {
      setError('The calendar was not connected. Google may have been closed or calendar access was not ticked. Try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    const r = await integrationsApi.googleCalendar.start(accountId, 'admin');
    if (r.error || !r.data?.url) {
      setBusy(null);
      setError(r.error ?? 'Could not start the connection.');
      return;
    }
    window.location.assign(r.data.url);
  };

  const disconnect = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    setBusy('disconnect');
    setError(null);
    const r = await integrationsApi.googleCalendar.disconnect(accountId);
    setBusy(null);
    if (r.error) return setError(r.error);
    flash('Disconnected. Google has been told to take the permission back.');
    await load();
  };

  if (!cal) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading calendar…'}</p>;

  if (!google.plugged) return <NotPluggedIn id="google_calendar" />;

  const st = STATUS_TEXT[cal.status] ?? STATUS_TEXT.not_connected;
  const connected = cal.status === 'active';
  const needsReconnect = cal.status === 'needs_reauth' || cal.status === 'error';

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      <Card
        title="Calendar connection"
        hint="Connect the owner's Google Calendar. We never offer a time they are busy, and every booked inspection is added to their calendar, moved when it moves, and removed if it is cancelled."
        action={<Chip tone={st.tone}>{st.label}</Chip>}
      >
        {connected || needsReconnect ? (
          <>
            <Row label="Connected as" value={cal.calendar_label || 'Google Calendar'} />
            <Row label="Last synced" value={cal.last_synced_at ? relativeTime(cal.last_synced_at) : 'Not yet'} />
            {cal.last_error && <Notice tone="error">{cal.last_error}</Notice>}
            {needsReconnect && (
              <Notice tone="error">The connection stopped working. The owner needs to approve it again with Reconnect.</Notice>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {connected && (
                <Button onClick={() => runSync(false)} disabled={busy !== null}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                </Button>
              )}
              <Button tone={needsReconnect ? 'primary' : 'quiet'} onClick={connect} disabled={busy !== null}>
                {busy === 'connect' ? 'Opening Google…' : 'Reconnect'}
              </Button>
              <Button tone={confirming ? 'danger' : 'quiet'} onClick={disconnect} disabled={busy !== null}>
                {confirming ? 'Confirm: disconnect' : 'Disconnect'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-slate-300">
              Nothing is connected. Press Connect and sign in with the Google account whose calendar should be used. It asks for one thing: to see and add events.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={connect} disabled={busy !== null}>
                {busy === 'connect' ? 'Opening Google…' : 'Connect Google Calendar'}
              </Button>
              <Button tone="quiet" disabled>
                Outlook: coming next
              </Button>
            </div>
            <p className="text-[13px] leading-relaxed text-slate-500">
              The owner can also connect it themselves from their Setup page. Either way it shows up here.
            </p>
          </>
        )}
      </Card>

      <Card title="What is happening" hint="Updated automatically. The scheduled sync runs every few minutes while a calendar is connected.">
        <Row label="Busy times we are avoiding" value={String(cal.busy_blocks)} />
        <Row label="Inspections waiting to go on the calendar" value={String(cal.pending_writes)} />
        <Row label="Failed to write" value={String(cal.failed_writes)} />
        <Row label="Upcoming inspections" value={String(cal.upcoming_appointments)} />
        <Row label="Inspections on the calendar" value={String(cal.synced_appointments)} />
      </Card>
    </div>
  );
};
