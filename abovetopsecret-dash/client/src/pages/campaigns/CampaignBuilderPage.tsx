import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchCampaignDraft,
  createCampaignDraft,
  updateCampaignDraft,
  createCampaignAdSet,
  updateCampaignAdSet,
  deleteCampaignAdSet,
  createCampaignAd,
  updateCampaignAd,
  deleteCampaignAd,
  uploadCampaignMedia,
  searchTargetingInterests,
  validateCampaignDraft,
  publishCampaignDraft,
  activateCampaign,
  fetchAccounts,
  CampaignDraft,
  CampaignAdSet,
  CampaignAd,
  Account,
  PublishResult,
  ValidationResult,
} from '../../lib/api';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  Send,
  Play,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────

const OBJECTIVES = [
  { value: 'OUTCOME_SALES', label: 'Sales' },
  { value: 'OUTCOME_TRAFFIC', label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: 'OUTCOME_LEADS', label: 'Leads' },
  { value: 'OUTCOME_AWARENESS', label: 'Awareness' },
  { value: 'OUTCOME_APP_PROMOTION', label: 'App Promotion' },
];

const SPECIAL_AD_CATEGORIES = [
  { value: 'CREDIT', label: 'Credit' },
  { value: 'EMPLOYMENT', label: 'Employment' },
  { value: 'HOUSING', label: 'Housing' },
  { value: 'SOCIAL_ISSUES_ELECTIONS_POLITICS', label: 'Social Issues / Elections / Politics' },
];

const BID_STRATEGIES = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest Cost' },
  { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Bid Cap' },
  { value: 'COST_CAP', label: 'Cost Cap' },
  { value: 'LOWEST_COST_WITH_MIN_ROAS', label: 'Minimum ROAS' },
];

const CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'BOOK_TRAVEL', label: 'Book Travel' },
  { value: 'CONTACT_US', label: 'Contact Us' },
];

const GENDER_OPTIONS = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Male' },
  { value: 2, label: 'Female' },
];

const STEP_LABELS = ['Campaign Setup', 'Ad Sets', 'Ads & Creative', 'Review & Publish'];

// ── Style helpers ────────────────────────────────────────────────────

const inputCls =
  'w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:outline-none focus:border-ats-accent transition-colors';
const selectCls =
  'w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text focus:outline-none focus:border-ats-accent transition-colors appearance-none';
const labelCls = 'text-[10px] text-ats-text-muted uppercase tracking-widest font-mono mb-1 block';
const btnPrimary =
  'px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2';
const btnSecondary =
  'px-5 py-2.5 bg-ats-card border border-ats-border text-ats-text rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2';
const btnDanger =
  'px-3 py-1.5 text-ats-red hover:bg-red-900/30 rounded-lg text-xs transition-colors flex items-center gap-1';

// ── Local types for form state ───────────────────────────────────────

interface InterestOption {
  id: string;
  name: string;
}

interface AdSetForm {
  id?: number;
  name: string;
  targeting: {
    geo_locations: { countries: string[] };
    age_min: number;
    age_max: number;
    genders: number[];
    interests: InterestOption[];
  };
  budget_type: 'daily' | 'lifetime';
  budget_amount: string;
  bid_strategy: string;
  schedule_start: string;
  schedule_end: string;
}

interface AdForm {
  id?: number;
  adset_index: number;
  name: string;
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  link_url: string;
  media_file: File | null;
  media_upload_id: number | null;
  media_filename: string;
}

function emptyAdSet(): AdSetForm {
  return {
    name: '',
    targeting: {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
      genders: [0],
      interests: [],
    },
    budget_type: 'daily',
    budget_amount: '',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    schedule_start: '',
    schedule_end: '',
  };
}

function emptyAd(adsetIndex: number): AdForm {
  return {
    adset_index: adsetIndex,
    name: '',
    primary_text: '',
    headline: '',
    description: '',
    cta: 'LEARN_MORE',
    link_url: '',
    media_file: null,
    media_upload_id: null,
    media_filename: '',
  };
}

// ── Step Indicator ───────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === step;
        const isCompleted = stepNum < step;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-ats-accent text-white'
                    : isCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-ats-card border border-ats-border text-ats-text-muted'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
              </div>
              <span
                className={`text-[10px] mt-1 font-mono whitespace-nowrap ${
                  isActive ? 'text-ats-accent' : isCompleted ? 'text-emerald-400' : 'text-ats-text-muted'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`w-8 sm:w-16 h-px mx-1 mb-4 ${
                  stepNum < step ? 'bg-emerald-600' : 'bg-ats-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Country Multi-Select ─────────────────────────────────────────────

const COMMON_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'BE', name: 'Belgium' },
];

function CountryMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${inputCls} text-left flex items-center justify-between`}
      >
        <span className={selected.length === 0 ? 'text-ats-text-muted' : ''}>
          {selected.length === 0
            ? 'Select countries...'
            : selected.join(', ')}
        </span>
        <ChevronRight className={`w-3 h-3 text-ats-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-ats-card border border-ats-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {COMMON_COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => toggle(c.code)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-ats-hover flex items-center gap-2 ${
                selected.includes(c.code) ? 'text-ats-accent' : 'text-ats-text'
              }`}
            >
              {selected.includes(c.code) && <Check className="w-3 h-3" />}
              <span className={selected.includes(c.code) ? '' : 'ml-5'}>
                {c.code} - {c.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Interest Autocomplete ────────────────────────────────────────────

function InterestAutocomplete({
  selected,
  onChange,
}: {
  selected: InterestOption[];
  onChange: (v: InterestOption[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InterestOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchTargetingInterests(query);
        setResults(
          data.map((d: any) => ({ id: String(d.id), name: d.name })).filter(
            (r: InterestOption) => !selected.some((s) => s.id === r.id)
          )
        );
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const addInterest = (interest: InterestOption) => {
    onChange([...selected, interest]);
    setQuery('');
    setResults([]);
  };

  const removeInterest = (id: string) => {
    onChange(selected.filter((s) => s.id !== id));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selected.map((interest) => (
          <span
            key={interest.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-ats-accent/20 text-ats-accent text-xs rounded-full"
          >
            {interest.name}
            <button
              type="button"
              onClick={() => removeInterest(interest.id)}
              className="hover:text-white"
            >
              x
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search interests (e.g. fitness, cooking)..."
          className={inputCls}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-ats-text-muted animate-spin" />
        )}
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-ats-card border border-ats-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addInterest(r)}
                className="w-full text-left px-3 py-1.5 text-xs text-ats-text hover:bg-ats-hover"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Confirmation Modal ───────────────────────────────────────────────

function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-ats-card border border-ats-border rounded-xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-bold text-ats-text mb-2">{title}</h3>
        <p className="text-sm text-ats-text-muted mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className={btnSecondary}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className={btnPrimary}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Publish as Paused
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Publish Results Panel ────────────────────────────────────────────

function PublishResultsPanel({
  result,
  draftId,
  onActivate,
}: {
  result: PublishResult;
  draftId: number;
  onActivate: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        {result.success ? (
          <>
            <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ats-text">Published Successfully</h3>
              <p className="text-xs text-ats-text-muted">
                Campaign created as PAUSED. Meta Campaign ID: {result.meta_campaign_id}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ats-text">Publish Failed</h3>
              <p className="text-xs text-ats-red">{result.error}</p>
            </div>
          </>
        )}
      </div>

      {/* Per-entity status */}
      <div className="space-y-3 mb-6">
        <h4 className="text-xs text-ats-text-muted uppercase font-mono tracking-widest">Ad Sets</h4>
        {result.adsets.map((as, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
              as.error ? 'bg-red-900/20 text-ats-red' : 'bg-emerald-900/20 text-emerald-400'
            }`}
          >
            <span>Ad Set #{as.local_id}</span>
            <span>{as.error || `Meta ID: ${as.meta_id}`}</span>
          </div>
        ))}

        <h4 className="text-xs text-ats-text-muted uppercase font-mono tracking-widest mt-4">Ads</h4>
        {result.ads.map((ad, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
              ad.error ? 'bg-red-900/20 text-ats-red' : 'bg-emerald-900/20 text-emerald-400'
            }`}
          >
            <span>Ad #{ad.local_id}</span>
            <span>{ad.error || `Meta ID: ${ad.meta_id}`}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {result.success && (
          <button onClick={onActivate} className={btnPrimary}>
            <Play className="w-4 h-4" />
            Activate Campaign
          </button>
        )}
        <button onClick={() => navigate('/campaigns')} className={btnSecondary}>
          Back to Campaigns
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ═══ STEP 1: Campaign Setup ═════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

function Step1CampaignSetup({
  accounts,
  accountId,
  setAccountId,
  campaignName,
  setCampaignName,
  objective,
  setObjective,
  specialAdCategories,
  setSpecialAdCategories,
}: {
  accounts: Account[];
  accountId: number | null;
  setAccountId: (v: number | null) => void;
  campaignName: string;
  setCampaignName: (v: string) => void;
  objective: string;
  setObjective: (v: string) => void;
  specialAdCategories: string[];
  setSpecialAdCategories: (v: string[]) => void;
}) {
  const toggleCategory = (val: string) => {
    if (specialAdCategories.includes(val)) {
      setSpecialAdCategories(specialAdCategories.filter((c) => c !== val));
    } else {
      setSpecialAdCategories([...specialAdCategories, val]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-ats-card border border-ats-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-ats-text mb-4">Campaign Setup</h3>

        {/* Account picker */}
        <div className="mb-4">
          <label className={labelCls}>Ad Account</label>
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
            className={selectCls}
          >
            <option value="">Select an account...</option>
            {accounts
              .filter((a) => a.platform === 'meta' || a.platform === 'facebook')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.platform_account_id || a.platform})
                </option>
              ))}
          </select>
        </div>

        {/* Campaign name */}
        <div className="mb-4">
          <label className={labelCls}>Campaign Name</label>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Summer Sale 2026 - Conversions"
            className={inputCls}
          />
        </div>

        {/* Objective selector */}
        <div className="mb-4">
          <label className={labelCls}>Campaign Objective</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {OBJECTIVES.map((obj) => (
              <button
                key={obj.value}
                type="button"
                onClick={() => setObjective(obj.value)}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                  objective === obj.value
                    ? 'bg-ats-accent/20 border-ats-accent text-ats-accent'
                    : 'bg-ats-bg border-ats-border text-ats-text-muted hover:bg-ats-hover'
                }`}
              >
                {obj.label}
              </button>
            ))}
          </div>
        </div>

        {/* Special ad categories */}
        <div>
          <label className={labelCls}>Special Ad Categories (if applicable)</label>
          <div className="flex flex-wrap gap-2">
            {SPECIAL_AD_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  specialAdCategories.includes(cat.value)
                    ? 'bg-amber-900/30 border-amber-600 text-amber-400'
                    : 'bg-ats-bg border-ats-border text-ats-text-muted hover:bg-ats-hover'
                }`}
              >
                {specialAdCategories.includes(cat.value) && (
                  <Check className="w-3 h-3 inline mr-1" />
                )}
                {cat.label}
              </button>
            ))}
          </div>
          {specialAdCategories.length === 0 && (
            <p className="text-[10px] text-ats-text-muted mt-1">
              None selected -- only select if your ads relate to credit, employment, housing, or social issues.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ═══ STEP 2: Ad Sets ═══════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

function Step2AdSets({
  adSets,
  setAdSets,
  editingAdSet,
  setEditingAdSet,
}: {
  adSets: AdSetForm[];
  setAdSets: (v: AdSetForm[]) => void;
  editingAdSet: number | null;
  setEditingAdSet: (v: number | null) => void;
}) {
  const updateAdSet = (index: number, partial: Partial<AdSetForm>) => {
    const next = [...adSets];
    next[index] = { ...next[index], ...partial };
    setAdSets(next);
  };

  const updateTargeting = (index: number, partial: Partial<AdSetForm['targeting']>) => {
    const next = [...adSets];
    next[index] = {
      ...next[index],
      targeting: { ...next[index].targeting, ...partial },
    };
    setAdSets(next);
  };

  const removeAdSet = (index: number) => {
    setAdSets(adSets.filter((_, i) => i !== index));
    if (editingAdSet === index) setEditingAdSet(null);
    else if (editingAdSet !== null && editingAdSet > index)
      setEditingAdSet(editingAdSet - 1);
  };

  const addAdSet = () => {
    const newSet = emptyAdSet();
    newSet.name = `Ad Set ${adSets.length + 1}`;
    setAdSets([...adSets, newSet]);
    setEditingAdSet(adSets.length);
  };

  return (
    <div className="space-y-4">
      {/* Ad set list */}
      {adSets.map((adSet, i) => (
        <div key={i} className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
          {/* Collapsed header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-ats-hover transition-colors"
            onClick={() => setEditingAdSet(editingAdSet === i ? null : i)}
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-ats-accent/20 rounded flex items-center justify-center text-ats-accent text-xs font-bold">
                {i + 1}
              </div>
              <div>
                <span className="text-sm font-semibold text-ats-text">
                  {adSet.name || `Ad Set ${i + 1}`}
                </span>
                <span className="text-xs text-ats-text-muted ml-2">
                  {adSet.budget_type === 'daily' ? 'Daily' : 'Lifetime'}{' '}
                  ${adSet.budget_amount || '0'} | {adSet.targeting.geo_locations.countries.join(', ') || 'No geo'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAdSet(i);
                }}
                className={btnDanger}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <ChevronRight
                className={`w-4 h-4 text-ats-text-muted transition-transform ${
                  editingAdSet === i ? 'rotate-90' : ''
                }`}
              />
            </div>
          </div>

          {/* Expanded form */}
          {editingAdSet === i && (
            <div className="px-4 pb-4 pt-2 border-t border-ats-border space-y-4">
              {/* Name */}
              <div>
                <label className={labelCls}>Ad Set Name</label>
                <input
                  value={adSet.name}
                  onChange={(e) => updateAdSet(i, { name: e.target.value })}
                  placeholder="Ad set name"
                  className={inputCls}
                />
              </div>

              {/* Targeting */}
              <div className="bg-ats-bg rounded-lg p-4 border border-ats-border space-y-4">
                <h4 className="text-xs font-bold text-ats-text uppercase tracking-widest">Targeting</h4>

                {/* Countries */}
                <div>
                  <label className={labelCls}>Countries</label>
                  <CountryMultiSelect
                    selected={adSet.targeting.geo_locations.countries}
                    onChange={(countries) =>
                      updateTargeting(i, {
                        geo_locations: { countries },
                      })
                    }
                  />
                </div>

                {/* Age */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Min Age</label>
                    <input
                      type="number"
                      min={13}
                      max={65}
                      value={adSet.targeting.age_min}
                      onChange={(e) =>
                        updateTargeting(i, { age_min: Number(e.target.value) })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Max Age</label>
                    <input
                      type="number"
                      min={13}
                      max={65}
                      value={adSet.targeting.age_max}
                      onChange={(e) =>
                        updateTargeting(i, { age_max: Number(e.target.value) })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className={labelCls}>Gender</label>
                  <select
                    value={adSet.targeting.genders[0] ?? 0}
                    onChange={(e) =>
                      updateTargeting(i, { genders: [Number(e.target.value)] })
                    }
                    className={selectCls}
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Interests */}
                <div>
                  <label className={labelCls}>Interests</label>
                  <InterestAutocomplete
                    selected={adSet.targeting.interests}
                    onChange={(interests) => updateTargeting(i, { interests })}
                  />
                </div>
              </div>

              {/* Budget */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Budget Type</label>
                  <select
                    value={adSet.budget_type}
                    onChange={(e) =>
                      updateAdSet(i, { budget_type: e.target.value as 'daily' | 'lifetime' })
                    }
                    className={selectCls}
                  >
                    <option value="daily">Daily Budget</option>
                    <option value="lifetime">Lifetime Budget</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Budget Amount ($)</label>
                  <input
                    type="number"
                    min={1}
                    step={0.01}
                    value={adSet.budget_amount}
                    onChange={(e) => updateAdSet(i, { budget_amount: e.target.value })}
                    placeholder="50.00"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Bid strategy */}
              <div>
                <label className={labelCls}>Bid Strategy</label>
                <select
                  value={adSet.bid_strategy}
                  onChange={(e) => updateAdSet(i, { bid_strategy: e.target.value })}
                  className={selectCls}
                >
                  {BID_STRATEGIES.map((bs) => (
                    <option key={bs.value} value={bs.value}>
                      {bs.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input
                    type="date"
                    value={adSet.schedule_start}
                    onChange={(e) => updateAdSet(i, { schedule_start: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input
                    type="date"
                    value={adSet.schedule_end}
                    onChange={(e) => updateAdSet(i, { schedule_end: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add ad set button */}
      <button onClick={addAdSet} className={`${btnSecondary} w-full justify-center`}>
        <Plus className="w-4 h-4" />
        Add Ad Set
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ═══ STEP 3: Ads & Creative ════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

function Step3Ads({
  adSets,
  ads,
  setAds,
  accountId,
}: {
  adSets: AdSetForm[];
  ads: AdForm[];
  setAds: (v: AdForm[]) => void;
  accountId: number | null;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const getAdsForAdSet = (adsetIndex: number) =>
    ads.filter((a) => a.adset_index === adsetIndex);

  const updateAd = (globalIndex: number, partial: Partial<AdForm>) => {
    const next = [...ads];
    next[globalIndex] = { ...next[globalIndex], ...partial };
    setAds(next);
  };

  const addAd = (adsetIndex: number) => {
    const newAd = emptyAd(adsetIndex);
    const existingCount = getAdsForAdSet(adsetIndex).length;
    newAd.name = `Ad ${existingCount + 1}`;
    setAds([...ads, newAd]);
  };

  const removeAd = (globalIndex: number) => {
    setAds(ads.filter((_, i) => i !== globalIndex));
  };

  const handleMediaUpload = async (globalIndex: number, file: File) => {
    setUploadingIndex(globalIndex);
    try {
      const result = await uploadCampaignMedia(file, accountId ?? undefined);
      const next = [...ads];
      next[globalIndex] = {
        ...next[globalIndex],
        media_file: file,
        media_upload_id: result.id,
        media_filename: file.name,
      };
      setAds(next);
    } catch {
      // Upload failed silently - user can retry
    }
    setUploadingIndex(null);
  };

  return (
    <div className="space-y-6">
      {adSets.map((adSet, adsetIndex) => (
        <div key={adsetIndex} className="bg-ats-card border border-ats-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ats-text">
              {adSet.name || `Ad Set ${adsetIndex + 1}`}
            </h3>
            <button
              onClick={() => addAd(adsetIndex)}
              className="px-3 py-1.5 bg-ats-accent/20 text-ats-accent rounded-lg text-xs font-semibold hover:bg-ats-accent/30 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Ad
            </button>
          </div>

          {getAdsForAdSet(adsetIndex).length === 0 && (
            <p className="text-xs text-ats-text-muted py-4 text-center">
              No ads yet. Click "Add Ad" to create one.
            </p>
          )}

          <div className="space-y-4">
            {ads.map((ad, globalIndex) => {
              if (ad.adset_index !== adsetIndex) return null;
              return (
                <div
                  key={globalIndex}
                  className="bg-ats-bg border border-ats-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ats-text">
                      {ad.name || `Ad ${globalIndex + 1}`}
                    </span>
                    <button onClick={() => removeAd(globalIndex)} className={btnDanger}>
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>

                  {/* Ad name */}
                  <div>
                    <label className={labelCls}>Ad Name</label>
                    <input
                      value={ad.name}
                      onChange={(e) => updateAd(globalIndex, { name: e.target.value })}
                      placeholder="Ad name"
                      className={inputCls}
                    />
                  </div>

                  {/* Primary text */}
                  <div>
                    <label className={labelCls}>Primary Text</label>
                    <textarea
                      rows={3}
                      value={ad.primary_text}
                      onChange={(e) => updateAd(globalIndex, { primary_text: e.target.value })}
                      placeholder="The main body text of your ad..."
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Headline */}
                    <div>
                      <label className={labelCls}>Headline</label>
                      <input
                        value={ad.headline}
                        onChange={(e) => updateAd(globalIndex, { headline: e.target.value })}
                        placeholder="Headline"
                        className={inputCls}
                      />
                    </div>
                    {/* Description */}
                    <div>
                      <label className={labelCls}>Description</label>
                      <input
                        value={ad.description}
                        onChange={(e) => updateAd(globalIndex, { description: e.target.value })}
                        placeholder="Link description"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* CTA */}
                    <div>
                      <label className={labelCls}>Call to Action</label>
                      <select
                        value={ad.cta}
                        onChange={(e) => updateAd(globalIndex, { cta: e.target.value })}
                        className={selectCls}
                      >
                        {CTA_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Link URL */}
                    <div>
                      <label className={labelCls}>Link URL</label>
                      <input
                        value={ad.link_url}
                        onChange={(e) => updateAd(globalIndex, { link_url: e.target.value })}
                        placeholder="https://..."
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Media upload */}
                  <div>
                    <label className={labelCls}>Media</label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-ats-bg border border-dashed border-ats-border rounded-lg cursor-pointer hover:border-ats-accent transition-colors text-xs text-ats-text-muted">
                        {uploadingIndex === globalIndex ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {ad.media_filename
                          ? ad.media_filename
                          : uploadingIndex === globalIndex
                          ? 'Uploading...'
                          : 'Choose image or video'}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleMediaUpload(globalIndex, file);
                          }}
                        />
                      </label>
                      {ad.media_upload_id && (
                        <span className="text-emerald-400 text-xs flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Uploaded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {adSets.length === 0 && (
        <div className="bg-ats-card border border-ats-border rounded-xl p-8 text-center">
          <p className="text-sm text-ats-text-muted">No ad sets created yet. Go back to Step 2 to add ad sets.</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ═══ STEP 4: Review & Publish ══════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

function Step4Review({
  accounts,
  accountId,
  campaignName,
  objective,
  specialAdCategories,
  adSets,
  ads,
  validation,
  validating,
  onValidate,
}: {
  accounts: Account[];
  accountId: number | null;
  campaignName: string;
  objective: string;
  specialAdCategories: string[];
  adSets: AdSetForm[];
  ads: AdForm[];
  validation: ValidationResult | null;
  validating: boolean;
  onValidate: () => void;
}) {
  const account = accounts.find((a) => a.id === accountId);
  const objectiveLabel = OBJECTIVES.find((o) => o.value === objective)?.label || objective;

  return (
    <div className="space-y-4">
      {/* Campaign summary */}
      <div className="bg-ats-card border border-ats-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-ats-text mb-3">Campaign Summary</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <div>
            <span className="text-ats-text-muted">Account:</span>
            <span className="text-ats-text ml-2">{account?.name || 'None selected'}</span>
          </div>
          <div>
            <span className="text-ats-text-muted">Name:</span>
            <span className="text-ats-text ml-2">{campaignName || '--'}</span>
          </div>
          <div>
            <span className="text-ats-text-muted">Objective:</span>
            <span className="text-ats-text ml-2">{objectiveLabel}</span>
          </div>
          <div>
            <span className="text-ats-text-muted">Special Categories:</span>
            <span className="text-ats-text ml-2">
              {specialAdCategories.length > 0 ? specialAdCategories.join(', ') : 'None'}
            </span>
          </div>
          <div>
            <span className="text-ats-text-muted">Ad Sets:</span>
            <span className="text-ats-text ml-2">{adSets.length}</span>
          </div>
          <div>
            <span className="text-ats-text-muted">Total Ads:</span>
            <span className="text-ats-text ml-2">{ads.length}</span>
          </div>
        </div>
      </div>

      {/* Ad sets detail */}
      {adSets.map((adSet, i) => {
        const adSetAds = ads.filter((a) => a.adset_index === i);
        return (
          <div key={i} className="bg-ats-card border border-ats-border rounded-xl p-5">
            <h4 className="text-xs font-bold text-ats-text mb-2">
              Ad Set: {adSet.name || `Ad Set ${i + 1}`}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] mb-3">
              <div>
                <span className="text-ats-text-muted">Budget: </span>
                <span className="text-ats-text">
                  ${adSet.budget_amount || '0'} {adSet.budget_type}
                </span>
              </div>
              <div>
                <span className="text-ats-text-muted">Geo: </span>
                <span className="text-ats-text">
                  {adSet.targeting.geo_locations.countries.join(', ') || 'None'}
                </span>
              </div>
              <div>
                <span className="text-ats-text-muted">Age: </span>
                <span className="text-ats-text">
                  {adSet.targeting.age_min}-{adSet.targeting.age_max}
                </span>
              </div>
              <div>
                <span className="text-ats-text-muted">Gender: </span>
                <span className="text-ats-text">
                  {GENDER_OPTIONS.find((g) => g.value === (adSet.targeting.genders[0] ?? 0))?.label || 'All'}
                </span>
              </div>
              <div>
                <span className="text-ats-text-muted">Interests: </span>
                <span className="text-ats-text">
                  {adSet.targeting.interests.length > 0
                    ? adSet.targeting.interests.map((i) => i.name).join(', ')
                    : 'Broad'}
                </span>
              </div>
              <div>
                <span className="text-ats-text-muted">Bid: </span>
                <span className="text-ats-text">
                  {BID_STRATEGIES.find((b) => b.value === adSet.bid_strategy)?.label || adSet.bid_strategy}
                </span>
              </div>
              {adSet.schedule_start && (
                <div>
                  <span className="text-ats-text-muted">Start: </span>
                  <span className="text-ats-text">{adSet.schedule_start}</span>
                </div>
              )}
              {adSet.schedule_end && (
                <div>
                  <span className="text-ats-text-muted">End: </span>
                  <span className="text-ats-text">{adSet.schedule_end}</span>
                </div>
              )}
            </div>

            {/* Ads in this ad set */}
            {adSetAds.length > 0 && (
              <div className="space-y-2 border-t border-ats-border pt-3 mt-3">
                <span className="text-[10px] text-ats-text-muted uppercase font-mono tracking-widest">
                  Ads ({adSetAds.length})
                </span>
                {adSetAds.map((ad, j) => (
                  <div key={j} className="bg-ats-bg rounded-lg p-3 text-[11px]">
                    <div className="font-semibold text-ats-text mb-1">{ad.name || `Ad ${j + 1}`}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-ats-text-muted">
                      <div>Headline: <span className="text-ats-text">{ad.headline || '--'}</span></div>
                      <div>CTA: <span className="text-ats-text">{CTA_OPTIONS.find((c) => c.value === ad.cta)?.label || ad.cta}</span></div>
                      <div>Link: <span className="text-ats-text">{ad.link_url || '--'}</span></div>
                      <div>Media: <span className="text-ats-text">{ad.media_filename || 'None'}</span></div>
                    </div>
                    {ad.primary_text && (
                      <div className="mt-1 text-ats-text-muted">
                        Text: <span className="text-ats-text">{ad.primary_text.slice(0, 80)}{ad.primary_text.length > 80 ? '...' : ''}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Validation */}
      <div className="bg-ats-card border border-ats-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-ats-text uppercase tracking-widest">Validation</h4>
          <button onClick={onValidate} disabled={validating} className={btnSecondary}>
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {validating ? 'Validating...' : 'Run Validation'}
          </button>
        </div>

        {validation && (
          <div className="space-y-2">
            {validation.valid ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 rounded-lg text-emerald-400 text-xs">
                <Check className="w-4 h-4" />
                All checks passed. Ready to publish.
              </div>
            ) : (
              validation.errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-2 bg-red-900/20 rounded-lg text-ats-red text-xs"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {err}
                </div>
              ))
            )}
          </div>
        )}

        {!validation && (
          <p className="text-xs text-ats-text-muted">
            Click "Run Validation" to check your campaign before publishing.
          </p>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ═══ MAIN COMPONENT ════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

export default function CampaignBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');

  // ── Global state ──────────────────────────────────────────────────

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Draft state
  const [draftId, setDraftId] = useState<number | null>(draftIdParam ? Number(draftIdParam) : null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('OUTCOME_SALES');
  const [specialAdCategories, setSpecialAdCategories] = useState<string[]>([]);

  // Ad sets & ads
  const [adSets, setAdSets] = useState<AdSetForm[]>([]);
  const [ads, setAds] = useState<AdForm[]>([]);
  const [editingAdSet, setEditingAdSet] = useState<number | null>(null);

  // Validation & publish
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ── Load accounts and existing draft ──────────────────────────────

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accts = await fetchAccounts();
      setAccounts(accts);

      // Load draft if ID in URL
      if (draftIdParam) {
        const draft = await fetchCampaignDraft(Number(draftIdParam));
        setDraftId(draft.id);
        setAccountId(draft.account_id);
        setCampaignName(draft.name);
        setObjective(draft.objective || 'OUTCOME_SALES');
        setSpecialAdCategories(draft.special_ad_categories || []);

        // Hydrate ad sets
        if (draft.adsets && draft.adsets.length > 0) {
          const loadedAdSets: AdSetForm[] = draft.adsets.map((as) => ({
            id: as.id,
            name: as.name,
            targeting: {
              geo_locations: as.targeting?.geo_locations || { countries: ['US'] },
              age_min: as.targeting?.age_min ?? 18,
              age_max: as.targeting?.age_max ?? 65,
              genders: as.targeting?.genders || [0],
              interests: (as.targeting?.interests || []).map((i: any) => ({
                id: String(i.id),
                name: i.name,
              })),
            },
            budget_type: as.budget_type || 'daily',
            budget_amount: as.budget_cents ? String(as.budget_cents / 100) : '',
            bid_strategy: as.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
            schedule_start: as.schedule_start?.split('T')[0] || '',
            schedule_end: as.schedule_end?.split('T')[0] || '',
          }));
          setAdSets(loadedAdSets);

          // Hydrate ads
          const loadedAds: AdForm[] = [];
          draft.adsets.forEach((as, adsetIndex) => {
            if (as.ads) {
              as.ads.forEach((ad) => {
                loadedAds.push({
                  id: ad.id,
                  adset_index: adsetIndex,
                  name: ad.name,
                  primary_text: ad.creative_config?.primary_text || '',
                  headline: ad.creative_config?.headline || '',
                  description: ad.creative_config?.description || '',
                  cta: ad.creative_config?.cta || 'LEARN_MORE',
                  link_url: ad.creative_config?.link_url || '',
                  media_file: null,
                  media_upload_id: ad.media_upload_id,
                  media_filename: ad.creative_config?.media_filename || '',
                });
              });
            }
          });
          setAds(loadedAds);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    }
    setLoading(false);
  }, [draftIdParam]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ── Auto-save logic ───────────────────────────────────────────────

  const saveDraft = useCallback(async () => {
    if (!accountId || !campaignName) return;
    setSaving(true);
    setError(null);
    try {
      let currentDraftId = draftId;

      // Create or update the campaign draft
      if (!currentDraftId) {
        const draft = await createCampaignDraft({
          account_id: accountId,
          name: campaignName,
          objective,
          special_ad_categories: specialAdCategories,
        });
        currentDraftId = draft.id;
        setDraftId(draft.id);
      } else {
        await updateCampaignDraft(currentDraftId, {
          account_id: accountId,
          name: campaignName,
          objective,
          special_ad_categories: specialAdCategories,
        } as any);
      }

      // Sync ad sets
      for (let i = 0; i < adSets.length; i++) {
        const adSet = adSets[i];
        const targeting = {
          geo_locations: adSet.targeting.geo_locations,
          age_min: adSet.targeting.age_min,
          age_max: adSet.targeting.age_max,
          genders: adSet.targeting.genders,
          interests: adSet.targeting.interests.map((int) => ({ id: int.id, name: int.name })),
        };
        const adSetPayload = {
          name: adSet.name,
          targeting,
          budget_type: adSet.budget_type,
          budget_cents: Math.round(parseFloat(adSet.budget_amount || '0') * 100),
          bid_strategy: adSet.bid_strategy,
          schedule_start: adSet.schedule_start || null,
          schedule_end: adSet.schedule_end || null,
        };

        if (adSet.id) {
          await updateCampaignAdSet(adSet.id, adSetPayload);
        } else {
          const created = await createCampaignAdSet(currentDraftId, adSetPayload);
          const next = [...adSets];
          next[i] = { ...next[i], id: created.id };
          setAdSets(next);

          // Sync ads for newly created ad set
          const adSetAds = ads.filter((a) => a.adset_index === i);
          for (let j = 0; j < adSetAds.length; j++) {
            const ad = adSetAds[j];
            const adPayload = {
              name: ad.name,
              creative_config: {
                primary_text: ad.primary_text,
                headline: ad.headline,
                description: ad.description,
                cta: ad.cta,
                link_url: ad.link_url,
                media_filename: ad.media_filename,
              },
              media_upload_id: ad.media_upload_id,
            };
            if (!ad.id) {
              const createdAd = await createCampaignAd(created.id, adPayload);
              const nextAds = [...ads];
              const globalIdx = nextAds.findIndex(
                (a) => a.adset_index === i && a.name === ad.name && !a.id
              );
              if (globalIdx >= 0) {
                nextAds[globalIdx] = { ...nextAds[globalIdx], id: createdAd.id };
                setAds(nextAds);
              }
            }
          }
        }
      }

      // Sync ads for existing ad sets
      for (const ad of ads) {
        const adSet = adSets[ad.adset_index];
        if (!adSet?.id) continue; // New ad set handled above

        const adPayload = {
          name: ad.name,
          creative_config: {
            primary_text: ad.primary_text,
            headline: ad.headline,
            description: ad.description,
            cta: ad.cta,
            link_url: ad.link_url,
            media_filename: ad.media_filename,
          },
          media_upload_id: ad.media_upload_id,
        };

        if (ad.id) {
          await updateCampaignAd(ad.id, adPayload);
        } else {
          const created = await createCampaignAd(adSet.id, adPayload);
          setAds((prev) =>
            prev.map((a) =>
              a === ad ? { ...a, id: created.id } : a
            )
          );
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save draft');
    }
    setSaving(false);
  }, [draftId, accountId, campaignName, objective, specialAdCategories, adSets, ads]);

  // ── Step navigation with auto-save ────────────────────────────────

  const goNext = async () => {
    if (step < 4) {
      await saveDraft();
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // ── Validation ────────────────────────────────────────────────────

  const runValidation = async () => {
    if (!draftId) {
      await saveDraft();
    }
    if (!draftId) {
      setValidation({ valid: false, errors: ['No draft saved yet. Please fill in campaign details.'] });
      return;
    }
    setValidating(true);
    try {
      const result = await validateCampaignDraft(draftId);
      setValidation(result);
    } catch (err: any) {
      setValidation({ valid: false, errors: [err.message || 'Validation failed'] });
    }
    setValidating(false);
  };

  // ── Publish ───────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!draftId) return;
    setPublishing(true);
    setShowConfirmModal(false);
    try {
      // Save latest state first
      await saveDraft();
      const result = await publishCampaignDraft(draftId);
      setPublishResult(result);
    } catch (err: any) {
      setPublishResult({
        success: false,
        adsets: [],
        ads: [],
        error: err.message || 'Publish failed',
      });
    }
    setPublishing(false);
  };

  // ── Activate (go live after publishing as PAUSED) ─────────────────

  const handleActivate = async () => {
    if (!draftId) return;
    try {
      await activateCampaign(draftId);
      navigate('/campaigns');
    } catch {
      // Activation failed silently
    }
  };

  // ── Can proceed validation ────────────────────────────────────────

  const canProceedStep1 = accountId !== null && campaignName.trim().length > 0;
  const canProceedStep2 = adSets.length > 0;
  const canProceedStep3 = ads.length > 0;

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-ats-bg min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-ats-text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading campaign builder...</span>
        </div>
      </div>
    );
  }

  // ── Published result state ────────────────────────────────────────

  if (publishResult) {
    return (
      <div className="bg-ats-bg min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-ats-text mb-6">Publish Results</h1>
          <PublishResultsPanel
            result={publishResult}
            draftId={draftId!}
            onActivate={handleActivate}
          />
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div className="bg-ats-bg min-h-screen">
      <div className="max-w-3xl mx-auto px-3 py-6 sm:px-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl sm:text-2xl font-bold text-ats-text">Campaign Builder</h1>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-[10px] text-ats-text-muted flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            )}
            {draftId && !saving && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Draft saved
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-ats-text-muted mb-6">
          Build and publish Meta ad campaigns. All campaigns are published as PAUSED.
        </p>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-red-900/20 border border-red-800 rounded-lg text-ats-red text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Step content */}
        {step === 1 && (
          <Step1CampaignSetup
            accounts={accounts}
            accountId={accountId}
            setAccountId={setAccountId}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            objective={objective}
            setObjective={setObjective}
            specialAdCategories={specialAdCategories}
            setSpecialAdCategories={setSpecialAdCategories}
          />
        )}

        {step === 2 && (
          <Step2AdSets
            adSets={adSets}
            setAdSets={setAdSets}
            editingAdSet={editingAdSet}
            setEditingAdSet={setEditingAdSet}
          />
        )}

        {step === 3 && (
          <Step3Ads adSets={adSets} ads={ads} setAds={setAds} accountId={accountId} />
        )}

        {step === 4 && (
          <Step4Review
            accounts={accounts}
            accountId={accountId}
            campaignName={campaignName}
            objective={objective}
            specialAdCategories={specialAdCategories}
            adSets={adSets}
            ads={ads}
            validation={validation}
            validating={validating}
            onValidate={runValidation}
          />
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-ats-border">
          <div>
            {step > 1 && (
              <button onClick={goBack} className={btnSecondary}>
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 4 && (
              <button
                onClick={goNext}
                disabled={
                  saving ||
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                }
                className={btnPrimary}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
            {step === 4 && (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={publishing}
                className={`${btnPrimary} bg-emerald-600 hover:bg-emerald-500`}
              >
                {publishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {publishing ? 'Publishing...' : 'Publish Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      <ConfirmModal
        open={showConfirmModal}
        title="Publish Campaign"
        message={`This will create the campaign "${campaignName}" on Meta with all ${adSets.length} ad set(s) and ${ads.length} ad(s). The campaign will be published as PAUSED -- you can activate it afterwards.`}
        onConfirm={handlePublish}
        onCancel={() => setShowConfirmModal(false)}
        loading={publishing}
      />
    </div>
  );
}
