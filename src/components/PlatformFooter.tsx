import React from 'react';

/** The same quiet line the sign-in page ends with, at the bottom of every client page. */
export const PlatformFooter: React.FC = () => (
  <footer className="w-full pb-28 pt-12 md:pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
    <p className="font-body text-xs tracking-wide text-slate-500">WedgeScale Dashboard Platform</p>
  </footer>
);
