// The admin area: which screen to show for which address. The screens themselves live in src/features/admin.
import React, { useCallback, useState } from 'react';
import { NotFoundPage } from './NotFoundPage';
import { AdminMfaGate } from '../features/admin/shell/AdminMfaGate';
import { AdminShell } from '../features/admin/shell/AdminShell';
import { AdminSettings } from '../features/admin/settings/AdminSettings';
import { ClientListView } from '../features/admin/clients/ClientListView';
import { NewClientView } from '../features/admin/clients/NewClientView';
import { ClientDetailView } from '../features/admin/clients/ClientDetailView';
import { TerritoriesView } from '../features/admin/territories/TerritoriesView';
import { IntegrationsPage } from '../integrations';

interface AdminPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
  accountId?: string | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onSignOut, userEmail = '', accountId = null }) => {
  const [denied, setDenied] = useState(false);

  const handleDenied = useCallback(() => setDenied(true), []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  // not an admin: look exactly like a page that does not exist
  if (denied) return <NotFoundPage onNavigate={onNavigate} />;

  const section = accountId === 'territories' ? 'territories' : accountId === 'settings' ? 'settings' : accountId === 'integrations' ? 'integrations' : 'clients';
  const isNew = accountId === 'new';

  // Everything, including the Clients / Territories / Settings navigation, sits INSIDE the gate.
  // Until the code is entered, the gate shows only its own slim header and the check.
  return (
    <AdminMfaGate onDenied={handleDenied} userEmail={userEmail} onSignOut={onSignOut}>
      <AdminShell section={section} userEmail={userEmail} onNavigate={goto} onSignOut={onSignOut}>
        {section === 'territories' ? (
          <TerritoriesView goto={goto} onDenied={handleDenied} />
        ) : section === 'integrations' ? (
          <IntegrationsPage />
        ) : section === 'settings' ? (
          <AdminSettings userEmail={userEmail} onSignOut={onSignOut} />
        ) : isNew ? (
          <NewClientView goto={goto} onDenied={handleDenied} />
        ) : accountId ? (
          <ClientDetailView accountId={accountId} goto={goto} onDenied={handleDenied} />
        ) : (
          <ClientListView goto={goto} onDenied={handleDenied} />
        )}
      </AdminShell>
    </AdminMfaGate>
  );
};

