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
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'summary-cards',
    route: '/summary',
    title: 'Welcome to Optic Data!',
    description: "Your data is syncing. This dashboard shows spend, revenue, ROAS, and profit at a glance.",
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
    description: 'Explore any section from the sidebar. Your data is on its way.',
  },
];

/** Streamlined mobile tour — same steps, different final description */
export const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'summary-cards',
    route: '/summary',
    title: 'Welcome to Optic Data!',
    description: "Your data is syncing. This dashboard shows spend, revenue, ROAS, and profit at a glance.",
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
  /** No-op — kept for backward compatibility with ConnectionsPage */
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
    // No-op — connection steps removed, kept for backward compatibility
  },

  reset: () => {
    localStorage.removeItem(TOUR_KEY);
    set({ active: false, currentStep: 0, skipped: false, mobile: false });
  },
}));
