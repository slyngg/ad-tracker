import { create } from 'zustand';
import { fetchAccounts, fetchOffers, Account, Offer } from '../lib/api';

const SELECTED_ACCOUNTS_KEY = 'optic_selected_accounts';
const SELECTED_OFFERS_KEY = 'optic_selected_offers';

function loadIds(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface AccountState {
  accounts: Account[];
  offers: Offer[];
  selectedAccountIds: number[];
  selectedOfferIds: number[];
  loading: boolean;
  loadAccounts: () => Promise<void>;
  loadOffers: () => Promise<void>;
  setSelectedAccountIds: (ids: number[]) => void;
  setSelectedOfferIds: (ids: number[]) => void;
  clearFilters: () => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  offers: [],
  selectedAccountIds: loadIds(SELECTED_ACCOUNTS_KEY),
  selectedOfferIds: loadIds(SELECTED_OFFERS_KEY),
  loading: false,

  loadAccounts: async () => {
    try {
      set({ loading: true });
      const accounts = await fetchAccounts();
      set({ accounts });
    } catch {
      // silent
    } finally {
      set({ loading: false });
    }
  },

  loadOffers: async () => {
    try {
      const offers = await fetchOffers();
      set({ offers });
    } catch {
      // silent
    }
  },

  setSelectedAccountIds: (ids: number[]) => {
    localStorage.setItem(SELECTED_ACCOUNTS_KEY, JSON.stringify(ids));
    set({ selectedAccountIds: ids });
  },

  setSelectedOfferIds: (ids: number[]) => {
    localStorage.setItem(SELECTED_OFFERS_KEY, JSON.stringify(ids));
    set({ selectedOfferIds: ids });
  },

  clearFilters: () => {
    localStorage.removeItem(SELECTED_ACCOUNTS_KEY);
    localStorage.removeItem(SELECTED_OFFERS_KEY);
    set({ selectedAccountIds: [], selectedOfferIds: [] });
  },
}));

export function getAccountFilterParams(): URLSearchParams {
  const { selectedAccountIds, selectedOfferIds } = useAccountStore.getState();
  const params = new URLSearchParams();
  if (selectedAccountIds.length > 0) {
    params.set('account_id', selectedAccountIds.join(','));
  }
  if (selectedOfferIds.length > 0) {
    params.set('offer_id', selectedOfferIds.join(','));
  }
  return params;
}
