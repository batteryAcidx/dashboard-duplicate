import React from 'react';

/**
 * The same quiet line the sign-in page ends with, at the bottom of every client page.
 * clearTabs: leave room for the bottom bar on a phone. Turn it off where the bar is hidden (inside a conversation),
 * so the page ends naturally instead of with a screen of empty space.
 */
export const PlatformFooter: React.FC<{ clearTabs?: boolean }> = ({ clearTabs = true }) => (
  <footer
    className={`w-full pt-8 text-center ${
      clearTabs ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-[max(2rem,env(safe-area-inset-bottom))]' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
    }`}
  >
    <p className="font-body text-xs tracking-wide text-slate-500">WedgeScale Dashboard Platform</p>
  </footer>
);
