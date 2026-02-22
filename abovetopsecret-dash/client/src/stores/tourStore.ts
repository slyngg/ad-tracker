import { create } from 'zustand';
import { getAuthToken } from './authStore';

const TOUR_KEY = 'optic_tour_state';

function callOnboardingComplete() {
  const token = getAuthToken();
  if (!token) return;
  fetch('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => {});
}

export interface TourStep {
  id: string;
  target: string; // data-tour attribute value
  route: string;
  title: string;
  description: string;
  /** If true, step advances when user clicks the target element */
  advanceOnClick?: boolean;
  /** If true, wait for an external event (e.g. provider-connected) to advance */
  waitForEvent?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'summary-cards',
    route: '/summary',
    title: 'Welcome to Optic Data!',
    description: "This is your command center. Let's connect your data so you can see real metrics.",
  },
  {
    id: 'nav-settings',
    target: 'nav-settings',
    route: '/summary',
    title: 'Open Settings',
    description: 'Click Settings to get started with your integrations.',
    advanceOnClick: true,
  },
  {
    id: 'nav-connections',
    target: 'nav-connections',
    route: '/summary',
    title: 'Go to Connections',
    description: 'Now click Connections to link your first data source.',
    advanceOnClick: true,
  },
  {
    id: 'platform-card',
    target: 'platform-card-first',
    route: '/settings/connections',
    title: 'Connect a Platform',
    description: "Connect any platform below. We'll wait here while you complete the OAuth flow.",
    waitForEvent: true,
  },
  {
    id: 'connection-done',
    target: 'connection-summary',
    route: '/settings/connections',
    title: "You're Connected!",
    description: 'Your data will start syncing within a few minutes.',
  },
  {
    id: 'nav-summary',
    target: 'nav-summary',
    route: '/settings/connections',
    title: 'Back to Summary',
    description: 'Click Summary to see your dashboard come to life.',
    advanceOnClick: true,
  },
  {
    id: 'tour-complete',
    target: 'summary-cards',
    route: '/summary',
    title: "All Set!",
    description: 'Explore any section from the sidebar. Your data is on its way.',
  },
];

interface TourState {
  active: boolean;
  currentStep: number;
  skipped: boolean;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  complete: () => void;
  /** Called by external events (e.g. OAuth success) to advance waitForEvent steps */
  advanceEvent: () => void;
  reset: () => void;
}

function loadPersistedState(): { active: boolean; currentStep: number; skipped: boolean } {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { active: false, currentStep: 0, skipped: false };
}

function persist(state: { active: boolean; currentStep: number; skipped: boolean }) {
  localStorage.setItem(TOUR_KEY, JSON.stringify(state));
}

const initial = loadPersistedState();

export const useTourStore = create<TourState>((set, get) => ({
  active: initial.active,
  currentStep: initial.currentStep,
  skipped: initial.skipped,

  start: () => {
    const s = { active: true, currentStep: 0, skipped: false };
    persist(s);
    set(s);
  },

  next: () => {
    const { currentStep } = get();
    const nextStep = currentStep + 1;
    if (nextStep >= TOUR_STEPS.length) {
      get().complete();
      return;
    }
    const s = { active: true, currentStep: nextStep, skipped: false };
    persist(s);
    set(s);
  },

  back: () => {
    const { currentStep } = get();
    if (currentStep <= 0) return;
    const s = { active: true, currentStep: currentStep - 1, skipped: false };
    persist(s);
    set(s);
  },

  skip: () => {
    // Block skipping until data provider is connected (past the waitForEvent step)
    const { currentStep } = get();
    const connectionStepIdx = TOUR_STEPS.findIndex(s => s.waitForEvent);
    if (connectionStepIdx >= 0 && currentStep <= connectionStepIdx) return;
    const s = { active: false, currentStep: 0, skipped: true };
    persist(s);
    set(s);
    callOnboardingComplete(); // Mark onboarding done so tour doesn't restart
  },

  complete: () => {
    const s = { active: false, currentStep: 0, skipped: false };
    persist(s);
    set(s);
    callOnboardingComplete();
  },

  advanceEvent: () => {
    const { active, currentStep } = get();
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
    if (step?.waitForEvent) {
      get().next();
    }
  },

  reset: () => {
    localStorage.removeItem(TOUR_KEY);
    set({ active: false, currentStep: 0, skipped: false });
  },
}));
