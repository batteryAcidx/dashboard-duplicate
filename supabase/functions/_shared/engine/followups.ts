import type { AccountContext } from './types.ts';
import { isQuietHours, nextQuietEnd } from './timeutil.ts';

type Quiet = Pick<AccountContext, 'timezone' | 'quietStart' | 'quietEnd'>;

/**
 * When to send the next follow-up. Returns null when the schedule is finished.
 * Follow-ups never go out in quiet hours; they move to just after quiet hours end, with a little jitter.
 */
export function nextFollowUpAt(opts: {
  now: Date;
  anchor: Date;            // when the lead first came in
  sent: number;            // follow-ups already sent
  scheduleHours: number[]; // offsets from the anchor, e.g. [4, 24, 72, 120, 168]
  account: Quiet;
  snoozeHours?: number | null;
  rng?: () => number;
}): Date | null {
  const { now, anchor, sent, scheduleHours, account, snoozeHours } = opts;
  const rng = opts.rng ?? Math.random;

  let target: Date;
  if (snoozeHours && snoozeHours > 0) {
    target = new Date(now.getTime() + snoozeHours * 3600_000);
  } else {
    if (sent >= scheduleHours.length) return null;
    target = new Date(anchor.getTime() + scheduleHours[sent] * 3600_000);
    if (target.getTime() <= now.getTime()) target = new Date(now.getTime() + 5 * 60_000);
  }
  if (isQuietHours(account, target)) {
    target = new Date(nextQuietEnd(account, target).getTime() + Math.floor(rng() * 40) * 60_000);
  }
  return target;
}
