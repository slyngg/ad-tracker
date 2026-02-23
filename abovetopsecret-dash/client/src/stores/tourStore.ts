import { create } from 'zustand';
import { getAuthToken } from './authStore';
import { isMobileViewport } from '../hooks/useIsMobile';

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

/** Streamlined mobile tour — skips sidebar interaction steps */
export const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'summary-cards',
    route: '/summary',
    title: 'Welcome to Optic Data!',
    description: "This is your command center. Let's connect your data so you can see real metrics.",
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
    id: 'meet-operator',
    target: 'operator-empty-state',
    route: '/operator',
    title: 'Meet your AI Assistant',
    description: 'Operator can analyze campaigns, suggest optimizations, and take actions — all from chat.',
  },
  {
    id: 'tour-complete',
    target: 'summary-cards',
    route: '/summary',
    title: "All Set!",
    description: 'Use the tabs at the bottom to navigate. Your data is on its way!',
  },
];

interface TourState {
  active: boolean;
  currentStep: number;
  skipped: boolean;
  mobile: boolean;
  /** Returns the correct step array based on mobile/desktop mode */
  getSteps: () => TourStep[];
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  complete: () => void;
  /** Called by external events (e.g. OAuth success) to advance waitForEvent steps */
  advanceEvent: () => void;
  reset: () => void;
}

function loadPersistedState(): { active: boolean; currentStep: number; skipped: boolean; mobile: boolean } {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) return { mobile: false, ...JSON.parse(raw) };
  } catch {}
  return { active: false, currentStep: 0, skipped: false, mobile: false };
}

function persist(state: { active: boolean; currentStep: number; skipped: boolean; mobile: boolean }) {
  localStorage.setItem(TOUR_KEY, JSON.stringify(state));
}

const initial = loadPersistedState();

export const useTourStore = create<TourState>((set, get) => ({
  active: initial.active,
  currentStep: initial.currentStep,
  skipped: initial.skipped,
  mobile: initial.mobile,

  getSteps: () => (get().mobile ? MOBILE_TOUR_STEPS : TOUR_STEPS),

  start: () => {
    const mobile = isMobileViewport();
    const s = { active: true, currentStep: 0, skipped: false, mobile };
    persist(s);
    set(s);
  },

  next: () => {
    const { currentStep, mobile } = get();
    const steps = mobile ? MOBILE_TOUR_STEPS : TOUR_STEPS;
    const nextStep = currentStep + 1;
    if (nextStep >= steps.length) {
      get().complete();
      return;
    }
    const s = { active: true, currentStep: nextStep, skipped: false, mobile };
    persist(s);
    set(s);
  },

  back: () => {
    const { currentStep, mobile } = get();
    if (currentStep <= 0) return;
    const s = { active: true, currentStep: currentStep - 1, skipped: false, mobile };
    persist(s);
    set(s);
  },

  skip: () => {
    // Block skipping until data provider is connected (past the waitForEvent step)
    const { currentStep, mobile } = get();
    const steps = mobile ? MOBILE_TOUR_STEPS : TOUR_STEPS;
    const connectionStepIdx = steps.findIndex(s => s.waitForEvent);
    if (connectionStepIdx >= 0 && currentStep <= connectionStepIdx) return;
    const s = { active: false, currentStep: 0, skipped: true, mobile: false };
    persist(s);
    set(s);
    callOnboardingComplete();
  },

  complete: () => {
    const s = { active: false, currentStep: 0, skipped: false, mobile: false };
    persist(s);
    set(s);
    callOnboardingComplete();
  },

  advanceEvent: () => {
    const { active, currentStep, mobile } = get();
    if (!active) return;
    const steps = mobile ? MOBILE_TOUR_STEPS : TOUR_STEPS;
    const step = steps[currentStep];
    if (step?.waitForEvent) {
      get().next();
    }
  },

  reset: () => {
    localStorage.removeItem(TOUR_KEY);
    set({ active: false, currentStep: 0, skipped: false, mobile: false });
  },
}));
