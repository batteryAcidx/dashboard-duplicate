import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '../../../components/ui';
import { CreateClientForm } from './CreateClientForm';
import { Card as UiCard } from '../../../components/ui';

export const NewClientView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => (
  <>
    <button
      type="button"
      onClick={() => goto('/admin')}
      className="mt-6 inline-flex cursor-pointer items-center gap-2 py-2 pr-3 font-display text-sm font-semibold text-slate-400 transition-colors hover:text-[#ffc174]"
    >
      <ArrowLeft className="h-4 w-4 text-[#ffc174]" />
      All clients
    </button>
    <PageTitle eyebrow="Admin" title="New client" subtitle="Add the business and its owner. The owner gets an invite email and their setup checklist. Everything else is filled in on the next page." />
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <CreateClientForm onDenied={onDenied} onCancel={() => goto('/admin')} onDone={(r) => goto(`/admin/${r.account_id}`)} />
      <UiCard title="What happens next">
        <ol className="list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-slate-300">
          <li>The owner is emailed an invite to set their password.</li>
          <li>Their setup checklist is created, so they can see the steps.</li>
          <li>You land on their page, where you add business details, the Twilio number, their calendar and billing.</li>
          <li>On the Setup tab you choose what to ask them for and can email them from there.</li>
        </ol>
      </UiCard>
    </div>
  </>
);

/* ---------- client list ---------- */

