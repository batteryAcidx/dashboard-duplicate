import React from 'react';
import { ChevronLeft, Phone } from 'lucide-react';
import { initialsOf } from '../domain';
import type { Urgency } from '../lib/leadView';
import { UrgencyBadge } from './UrgencyBadge';

interface Props {
  name: string;
  /** one quiet line under the name, such as "Roof repair · (214) 555-0101" */
  subtitle: string;
  urgency: Urgency;
  /** flagged earlier, but closed now */
  urgencyMuted?: boolean;
  /** a tel: link. No link, no Call button. */
  callHref?: string;
  onBack: () => void;
}

/**
 * The top of a conversation, like a chat app: back, avatar, name and one quiet line, and a single Call button.
 * One row, about as tall as a phone's title bar. On a phone it stays at the top while you read.
 * Everything else about the person (the address, when we are going, the controls) sits in one slim row below it.
 */
export const ConversationHeader: React.FC<Props> = ({ name, subtitle, urgency, urgencyMuted, callHref, onBack }) => (
  <header
    aria-label="Conversation"
    className="sticky top-0 z-30 -mx-5 border-b border-white/[0.06] bg-[#0c101d]/95 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
  >
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to queue"
        className="-ml-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#ffc174] transition-colors hover:bg-white/[0.06] lg:hidden"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#1b2438] font-display text-sm font-bold text-[#ffc174]"
      >
        {initialsOf(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 truncate font-display text-base font-bold tracking-tight text-slate-100 lg:text-lg">{name}</h3>
          <UrgencyBadge urgency={urgency} size="phone" muted={urgencyMuted} />
        </div>
        {subtitle && <p className="truncate text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {callHref && (
        <a
          href={callHref}
          aria-label={`Call ${name}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-[#150f05] transition-colors hover:bg-[#fbbf24]"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  </header>
);
