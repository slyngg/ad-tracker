import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 1024; // matches Tailwind `lg:`

const mql =
  typeof window !== 'undefined'
    ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    : null;

function subscribe(cb: () => void) {
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
}

function getSnapshot() {
  return mql?.matches ?? false;
}

/** Reactive hook — re-renders when viewport crosses the 1024px breakpoint. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Static check for use outside React (stores, event handlers). */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}
