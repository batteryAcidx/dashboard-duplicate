import React from 'react';
import { Card } from '../components/ui';
import { KIND_LABEL, WAITING, waitingByKind } from './waiting';
import type { WaitKind } from './waiting';

const KINDS: WaitKind[] = ['now', 'waiting', 'decide', 'build'];

/** Everything that depends on someone else: how long, what it blocks, and what to do meanwhile. */
export const WaitingList: React.FC = () => (
  <div>
    <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-slate-400">
      Some steps depend on someone else. This shows which, how long they usually take, and what you can do while you wait. {WAITING.length} items.
    </p>
    <div className="space-y-10">
      {KINDS.map((kind) => (
        <section key={kind}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{KIND_LABEL[kind]}</h3>
          <ul className="space-y-4">
            {waitingByKind(kind).map((w) => (
              <li key={w.id}>
                <Card title={w.title}>
                  <dl className="space-y-3 text-[15px] leading-relaxed">
                    <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">Who</dt><dd className="text-slate-200">{w.who}</dd></div>
                    <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">How long</dt><dd className="text-slate-200">{w.typical}</dd></div>
                    <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">It blocks</dt><dd className="text-slate-200">{w.blocks}</dd></div>
                    <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">Meanwhile</dt><dd className="text-slate-200">{w.meanwhile}</dd></div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </div>
);
