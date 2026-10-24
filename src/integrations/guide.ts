// The shape of a set-up guide. Guides are plain data, so the same words feed the in-app page and the docs folder.
import type { IntegrationId } from '../domain';

export interface GuideContext {
  /** the address of the backend, such as https://abcd1234.supabase.co */
  backendUrl: string;
  /** where the dashboard lives, such as https://dashboard.wedgescale.com */
  appUrl: string;
}

export interface CopyItem {
  label: string;
  value: string;
  /** a long value (a list or a script): shown in a box instead of one line */
  multiline?: boolean;
}

export interface GuideStep {
  title: string;
  /** short paragraphs, in plain words */
  body: string[];
  copy?: CopyItem[];
  link?: { label: string; href: string };
  /** a warning or a tip, shown set apart */
  note?: string;
}

export interface Guide {
  id: IntegrationId;
  intro: string;
  time: string;
  cost: string;
  steps: GuideStep[];
  /** how to know it works */
  checks: string[];
  /** things that are not needed yet but will be */
  later?: GuideStep[];
}

export type GuideBuilder = (ctx: GuideContext) => Guide;
