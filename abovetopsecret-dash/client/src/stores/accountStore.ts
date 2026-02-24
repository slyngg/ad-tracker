import { create } from 'zustand';
import { fetchAccounts, fetchOffers, fetchClients, fetchBrandConfigs, Account, Offer, Client, BrandConfig } from '../lib/api';

const SELECTED_ACCOUNTS_KEY = 'optic_selected_accounts';
const SELECTED_OFFERS_KEY = 'optic_selected_offers';
const SELECTED_CLIENT_KEY = 'optic_selected_client';
const SELECTED_BRAND_KEY = 'optic_selected_brand';

function loadIds(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadId(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const val = parseInt(raw, 10);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

interface AccountState {
  accounts: Account[];
  offers: Offer[];
  clients: Client[];
  brands: BrandConfig[];
  selectedAccountIds: number[];
  selectedOfferIds: number[];
  selectedClientId: number | null;
  selectedBrandId: number | null;
  loading: boolean;
  loadAccounts: () => Promise<void>;
  loadOffers: () => Promise<void>;
  loadClients: () => Promise<void>;
  loadBrands: () => Promise<void>;
  setSelectedAccountIds: (ids: number[]) => void;
  setSelectedOfferIds: (ids: number[]) => void;
  setSelectedClientId: (id: number | null) => void;
  setSelectedBrandId: (id: number | null) => void;
  clearFilters: () => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  offers: [],
  clients: [],
  brands: [],
  selectedAccountIds: loadIds(SELECTED_ACCOUNTS_KEY),
  selectedOfferIds: loadIds(SELECTED_OFFERS_KEY),
  selectedClientId: loadId(SELECTED_CLIENT_KEY),
  selectedBrandId: loadId(SELECTED_BRAND_KEY),
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

  loadClients: async () => {
    try {
      const clients = await fetchClients();
      set({ clients });
    } catch {
      // silent
    }
  },

  loadBrands: async () => {
    try {
      const brands = await fetchBrandConfigs();
      set({ brands });
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

  setSelectedClientId: (id: number | null) => {
    if (id !== null) {
      localStorage.setItem(SELECTED_CLIENT_KEY, String(id));
    } else {
      localStorage.removeItem(SELECTED_CLIENT_KEY);
    }
    // Clear brand when changing client
    localStorage.removeItem(SELECTED_BRAND_KEY);
    set({ selectedClientId: id, selectedBrandId: null });
  },

  setSelectedBrandId: (id: number | null) => {
    if (id !== null) {
      localStorage.setItem(SELECTED_BRAND_KEY, String(id));
    } else {
      localStorage.removeItem(SELECTED_BRAND_KEY);
    }
    set({ selectedBrandId: id });
  },

  clearFilters: () => {
    localStorage.removeItem(SELECTED_ACCOUNTS_KEY);
    localStorage.removeItem(SELECTED_OFFERS_KEY);
    localStorage.removeItem(SELECTED_CLIENT_KEY);
    localStorage.removeItem(SELECTED_BRAND_KEY);
    set({ selectedAccountIds: [], selectedOfferIds: [], selectedClientId: null, selectedBrandId: null });
  },
}));

export function getAccountFilterParams(): URLSearchParams {
  const { selectedAccountIds, selectedOfferIds, selectedClientId, selectedBrandId } = useAccountStore.getState();
  const params = new URLSearchParams();
  if (selectedAccountIds.length > 0) {
    params.set('account_id', selectedAccountIds.join(','));
  }
  if (selectedOfferIds.length > 0) {
    params.set('offer_id', selectedOfferIds.join(','));
  }
  // Brand/client filters — brand takes priority
  if (selectedBrandId) {
    params.set('brand_id', String(selectedBrandId));
  } else if (selectedClientId) {
    params.set('client_id', String(selectedClientId));
  }
  return params;
}
