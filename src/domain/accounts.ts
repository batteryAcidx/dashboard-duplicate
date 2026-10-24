// The shapes and wording for clients, their steps and their territories. Pure: no React, no network.
import type { StepStatus } from './models';

export type AccountStatus = 'setup' | 'live' | 'paused' | 'cancelled';

export type OwnerState = 'active' | 'pending' | 'none';

export interface ClientRow {
  id: string;
  name: string;
  status: AccountStatus;
  created_at: string;
  steps_done: number;
  steps_total: number;
  waiting: number;
  owner_email: string | null;
  owner_state: OwnerState;
  territories: string[];
}

export interface StepRow {
  id: string;
  step_key: string;
  title: string;
  status: StepStatus;
  note: string | null;
  completed_at: string | null;
  sort_order: number;
}

export interface TerritoryRef {
  id: string;
  name: string;
  country: string;
  region: string | null;
  locked_at: string | null;
}

export interface ClientDetail {
  account: {
    id: string;
    name: string;
    service_area: string | null;
    services: string | null;
    timezone: string;
    status: AccountStatus;
    registration_status: string;
    texting_number: string | null;
    notification_phone: string | null;
    ghl_location_id?: string | null;
    created_at: string;
  };
  territories: TerritoryRef[];
  steps: StepRow[];
  owner: {
    email: string | null;
    full_name: string | null;
    state: 'active' | 'pending';
    last_sign_in_at: string | null;
  } | null;
  counts: { leads: number; unread: number; last7: number };
  audit: { id: string; action: string; detail: string | null; created_at: string }[];
}

export interface TerritoryRow {
  id: string;
  name: string;
  country: string;
  region: string | null;
  account_id: string | null;
  locked_at: string | null;
  holder_name: string | null;
}

/* ---------- constants and helpers ---------- */

export const STEP_LABEL: Record<StepStatus, string> = {
  pending: 'Up next',
  in_progress: 'In progress',
  waiting_on_you: 'Waiting on client',
  done: 'Done',
};

export const STEP_ORDER: StepStatus[] = ['pending', 'in_progress', 'waiting_on_you', 'done'];

export const STATUS_LABEL: Record<AccountStatus, string> = {
  setup: 'Setting up',
  live: 'Live',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

export const TIMEZONES: [string, string][] = [
  ['America/New_York', 'Eastern (New York)'],
  ['America/Chicago', 'Central (Chicago)'],
  ['America/Denver', 'Mountain (Denver)'],
  ['America/Phoenix', 'Arizona (Phoenix)'],
  ['America/Los_Angeles', 'Pacific (Los Angeles)'],
  ['America/Anchorage', 'Alaska (Anchorage)'],
  ['Pacific/Honolulu', 'Hawaii (Honolulu)'],
  ['America/Toronto', 'Eastern (Toronto)'],
  ['America/Winnipeg', 'Central (Winnipeg)'],
  ['America/Edmonton', 'Mountain (Edmonton)'],
  ['America/Vancouver', 'Pacific (Vancouver)'],
  ['America/Halifax', 'Atlantic (Halifax)'],
];

export const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

