import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { integrationsApi } from '../api';
import { isPluggedIn } from '../domain';
import type { IntegrationId, IntegrationStatus, IntegrationStatusMap } from '../domain';

interface Api {
  statuses: IntegrationStatusMap | null;
  /** true once the check has finished (or failed) */
  checked: boolean;
  /** the check itself could not run, for example because the status function is not deployed yet */
  checkFailed: boolean;
  recheck: () => Promise<void>;
}

const Ctx = createContext<Api | null>(null);

/**
 * Asks the backend once which services are plugged in, so each screen can say "not plugged in yet"
 * instead of failing. If the check cannot run, nothing is hidden: a failed check never locks anyone out.
 */
export const IntegrationsProvider: React.FC<{ children: React.ReactNode; initial?: IntegrationStatusMap }> = ({ children, initial }) => {
  const [statuses, setStatuses] = useState<IntegrationStatusMap | null>(initial ?? null);
  const [checked, setChecked] = useState(Boolean(initial));
  const [checkFailed, setCheckFailed] = useState(false);

  const recheck = useCallback(async () => {
    const r = await integrationsApi.status.get();
    if (r.error || !r.data) {
      setCheckFailed(true);
      setStatuses(null);
    } else {
      setCheckFailed(false);
      setStatuses(r.data);
    }
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!initial) recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheck]);

  const value = useMemo(() => ({ statuses, checked, checkFailed, recheck }), [statuses, checked, checkFailed, recheck]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export interface IntegrationView {
  status: IntegrationStatus | undefined;
  /** false only when the backend has clearly said the settings are missing */
  plugged: boolean;
  checked: boolean;
}

/** Works anywhere, even outside the provider: then nothing is hidden. */
export function useIntegration(id: IntegrationId): IntegrationView {
  const ctx = useContext(Ctx);
  const status = ctx?.statuses?.[id];
  return { status, plugged: isPluggedIn(status), checked: ctx?.checked ?? false };
}

export function useIntegrations(): Api {
  return useContext(Ctx) ?? { statuses: null, checked: false, checkFailed: false, recheck: async () => undefined };
}
