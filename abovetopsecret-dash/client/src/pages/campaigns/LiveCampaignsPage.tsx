import { useState, useEffect, useRef, Fragment } from 'react';
import {
  fetchLiveCampaigns,
  fetchLiveAdsets,
  fetchLiveAds,
  updateLiveEntityStatus,
  updateLiveEntityBudget,
  quickCreateCampaign,
  batchCreateCampaign,
  duplicateLiveEntity,
  fetchAccounts,
  uploadCampaignMedia,
  LiveCampaign,
  LiveAdset,
  LiveAd,
  Account,
} from '../../lib/api';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  DollarSign,
  Radio,
  Plus,
  X,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  RefreshCw,
  Copy,
  Layers,
  ArrowUpDown,
  Film,
  Zap,
} from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import { useDateRangeStore } from '../../stores/dateRangeStore';

// ── Constants ───────────────────────────────────────────────

const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  all:       { bg: '',                 text: '',                label: 'All' },
  meta:      { bg: 'bg-blue-500/15',   text: 'text-blue-400',   label: 'Meta' },
  tiktok:    { bg: 'bg-pink-500/15',   text: 'text-pink-400',   label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
};

const OBJECTIVES: Record<string, { value: string; label: string }[]> = {
  newsbreak: [
    { value: 'TRAFFIC',         label: 'Traffic' },
    { value: 'CONVERSIONS',     label: 'Conversions' },
    { value: 'AWARENESS',       label: 'Awareness' },
    { value: 'ENGAGEMENT',      label: 'Engagement' },
    { value: 'APP_INSTALLS',    label: 'App Installs' },
    { value: 'LEAD_GENERATION', label: 'Lead Generation' },
  ],
  meta: [
    { value: 'OUTCOME_TRAFFIC',     label: 'Traffic' },
    { value: 'OUTCOME_SALES',       label: 'Sales / Conversions' },
    { value: 'OUTCOME_ENGAGEMENT',  label: 'Engagement' },
    { value: 'OUTCOME_LEADS',       label: 'Leads' },
    { value: 'OUTCOME_AWARENESS',   label: 'Awareness' },
  ],
  tiktok: [
    { value: 'TRAFFIC',     label: 'Traffic' },
    { value: 'CONVERSIONS', label: 'Conversions' },
    { value: 'REACH',       label: 'Reach' },
    { value: 'APP_INSTALL', label: 'App Install' },
  ],
};

const CTA_OPTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
  'CONTACT_US', 'GET_OFFER', 'SUBSCRIBE', 'APPLY_NOW', 'GET_QUOTE',
];

const EVENTS = [
  { value: 'Purchase', label: 'Purchase' },
  { value: 'AddToCart', label: 'Add to Cart' },
  { value: 'Lead', label: 'Lead' },
  { value: 'CompleteRegistration', label: 'Complete Registration' },
  { value: 'ViewContent', label: 'View Content' },
  { value: 'InitiateCheckout', label: 'Initiate Checkout' },
  { value: 'Search', label: 'Search' },
  { value: 'PageView', label: 'Page View' },
];

const NB_PLACEMENTS = [
  { value: 'ALL', label: 'All Placements' },
  { value: 'NEWSBREAK', label: 'NewsBreak' },
  { value: 'SCOOPZ', label: 'Scoopz' },
  { value: 'UNLIMITED', label: 'Unlimited' },
  { value: 'PREMIUM_PARTNERS', label: 'Premium Partners' },
];

const DYNAMIC_VARS = [
  { var: '{city}', label: 'City' },
  { var: '{state}', label: 'State' },
  { var: '{year}', label: 'Year' },
  { var: '{month}', label: 'Month' },
  { var: '{day_of_week}', label: 'Day' },
  { var: '{date}', label: 'Date' },
  { var: '{os}', label: 'OS' },
];

const FORMAT_PRESETS = [
  { format: '1-1-1', label: '1-1-1', desc: '1 campaign, 1 ad set, 1 ad' },
  { format: '1-3-1', label: '1-3-1', desc: '1 campaign, 3 ad sets, 1 ad each' },
  { format: '1-5-1', label: '1-5-1', desc: '1 campaign, 5 ad sets, 1 ad each' },
  { format: '1-1-3', label: '1-1-3', desc: '1 campaign, 1 ad set, 3 ads' },
  { format: '1-3-3', label: '1-3-3', desc: '1 campaign, 3 ad sets, 3 ads each' },
];

function fmt$(v: number) {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number) { return v.toLocaleString(); }
function fmtRoas(v: number) { return v.toFixed(2) + 'x'; }

type SortKey = 'spend' | 'clicks' | 'impressions' | 'conversions' | 'conversion_value' | 'roas' | 'campaign_name';
type SortDir = 'asc' | 'desc';

// ── Dynamic Content Inserter ─────────────────────────────────

function DynVarBar({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      <span className="text-[9px] text-ats-text-muted/60 mr-1 self-center">Insert:</span>
      {DYNAMIC_VARS.map(d => (
        <button
          key={d.var}
          type="button"
          onClick={() => onInsert(d.var)}
          className="px-1.5 py-0.5 text-[9px] bg-purple-500/15 text-purple-400 rounded font-mono hover:bg-purple-500/25 transition-colors"
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

// ── Campaign Creator Panel ──────────────────────────────────

interface CreatorState {
  platform: string;
  accountId: number | undefined;
  campaignName: string;
  objective: string;
  // Ad set
  adsetName: string;
  budgetType: 'daily' | 'lifetime';
  dailyBudget: string;
  scheduleStart: string;
  scheduleEnd: string;
  eventType: string;
  placements: string[];
  // Targeting
  gender: 'all' | 'male' | 'female';
  ageMin: string;
  ageMax: string;
  locations: string;
  languages: string;
  audienceList: string;
  // Optimization
  optimizationGoal: string;
  bidType: string;
  bidAmount: string;
  // Ad creative
  adName: string;
  headline: string;
  adText: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  landingUrl: string;
  cta: string;
  brandName: string;
  buttonText: string;
  thumbnailUrl: string;
}

const INITIAL_CREATOR: CreatorState = {
  platform: 'newsbreak',
  accountId: undefined,
  campaignName: '',
  objective: 'TRAFFIC',
  adsetName: '',
  budgetType: 'daily',
  dailyBudget: '10',
  scheduleStart: '',
  scheduleEnd: '',
  eventType: '',
  placements: ['ALL'],
  gender: 'all',
  ageMin: '18',
  ageMax: '65',
  locations: '',
  languages: '',
  audienceList: '',
  optimizationGoal: 'CONVERSIONS',
  bidType: 'LOWEST_COST_WITHOUT_CAP',
  bidAmount: '',
  adName: '',
  headline: '',
  adText: '',
  mediaType: 'image',
  mediaUrl: '',
  landingUrl: '',
  cta: 'LEARN_MORE',
  brandName: '',
  buttonText: '',
  thumbnailUrl: '',
};

function CampaignCreator({ onClose, onSuccess, accounts }: {
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
}) {
  const [form, setForm] = useState<CreatorState>(INITIAL_CREATOR);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const headlineRef = useRef<HTMLInputElement>(null);
  const adTextRef = useRef<HTMLTextAreaElement>(null);

  const platformAccounts = accounts.filter(a => a.platform === form.platform && a.status === 'active');
  const objectives = OBJECTIVES[form.platform] || OBJECTIVES.newsbreak;

  useEffect(() => {
    const accts = accounts.filter(a => a.platform === form.platform && a.status === 'active');
    setForm(f => ({
      ...f,
      accountId: accts[0]?.id,
      objective: (OBJECTIVES[f.platform] || OBJECTIVES.newsbreak)[0]?.value || 'TRAFFIC',
    }));
  }, [form.platform, accounts]);

  function set(key: keyof CreatorState, value: any) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function insertVar(ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>, key: keyof CreatorState, v: string) {
    const el = ref.current;
    if (!el) { set(key, (form as any)[key] + v); return; }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const cur = (form as any)[key] as string;
    const newVal = cur.slice(0, start) + v + cur.slice(end);
    set(key, newVal);
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + v.length; el.focus(); }, 0);
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > 500 * 1024 * 1024) { alert('Video max size is 500MB'); return; }
    if (!isVideo && file.size > 30 * 1024 * 1024) { alert('Image max size is 30MB'); return; }
    setUploading(true);
    try {
      const res = await uploadCampaignMedia(file, form.accountId);
      setForm(f => ({
        ...f,
        mediaUrl: `/api/campaigns/media/${res.id}`,
        mediaType: isVideo ? 'video' : 'image',
      }));
      setMediaPreview(URL.createObjectURL(file));
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Thumbnail max size is 5MB'); return; }
    try {
      const res = await uploadCampaignMedia(file, form.accountId);
      set('thumbnailUrl', `/api/campaigns/media/${res.id}`);
      setThumbPreview(URL.createObjectURL(file));
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    }
  }

  async function handlePublish() {
    if (!form.campaignName.trim()) { alert('Campaign name is required'); return; }
    if (!form.adText.trim() && !form.headline.trim()) { alert('Headline or ad text is required'); return; }
    if (parseFloat(form.dailyBudget) < 5) { alert('Minimum budget is $5.00'); return; }

    setPublishing(true);
    setResult(null);
    try {
      const targeting: Record<string, any> = {};
      if (form.gender !== 'all') targeting.gender = form.gender;
      if (form.ageMin) targeting.age_min = parseInt(form.ageMin);
      if (form.ageMax) targeting.age_max = parseInt(form.ageMax);
      if (form.locations.trim()) targeting.locations = form.locations.split(',').map(s => s.trim()).filter(Boolean);
      if (form.languages.trim()) targeting.languages = form.languages.split(',').map(s => s.trim()).filter(Boolean);
      if (form.audienceList.trim()) targeting.audience_list = form.audienceList.trim();

      const res = await quickCreateCampaign({
        account_id: form.accountId,
        platform: form.platform,
        campaign_name: form.campaignName.trim(),
        objective: form.objective,
        daily_budget: parseFloat(form.dailyBudget) || 10,
        budget_type: form.budgetType,
        adset_name: form.adsetName.trim() || undefined,
        ad_name: form.adName.trim() || undefined,
        headline: form.headline.trim() || undefined,
        ad_text: form.adText.trim(),
        image_url: form.mediaType === 'image' && form.mediaUrl.trim() ? form.mediaUrl.trim() : undefined,
        video_url: form.mediaType === 'video' && form.mediaUrl.trim() ? form.mediaUrl.trim() : undefined,
        landing_page_url: form.landingUrl.trim() || undefined,
        call_to_action: form.cta,
        targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
        placements: form.placements.includes('ALL') ? undefined : form.placements,
        optimization_goal: form.optimizationGoal || undefined,
        bid_type: form.bidType || undefined,
        bid_amount: form.bidAmount ? parseFloat(form.bidAmount) : undefined,
        event_type: form.eventType || undefined,
        brand_name: form.brandName.trim() || undefined,
        button_text: form.buttonText.trim() || undefined,
        thumbnail_url: form.thumbnailUrl.trim() || undefined,
      });
      setResult({ success: res.success, error: res.error });
      if (res.success) {
        setTimeout(() => { onSuccess(); onClose(); }, 1200);
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Failed to publish' });
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = form.campaignName.trim() && (form.adText.trim() || form.headline.trim()) && parseFloat(form.dailyBudget) >= 5;

  const inputCls = "w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent";
  const inputSmCls = inputCls + " text-xs";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-ats-bg border-l border-ats-border h-full flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-ats-border px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ats-text">New Campaign</h2>
            <p className="text-[11px] text-ats-text-muted mt-0.5">Set up &amp; publish in one go</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="shrink-0 flex border-b border-ats-border">
          {['Campaign', 'Ad Set', 'Creative'].map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                step === i
                  ? 'text-ats-accent border-ats-accent'
                  : 'text-ats-text-muted border-transparent hover:text-ats-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Step 0: Campaign */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Platform</Label>
                <div className="flex gap-2 mt-1.5">
                  {['newsbreak', 'meta', 'tiktok'].map((p) => (
                    <button
                      key={p}
                      onClick={() => set('platform', p)}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                        form.platform === p
                          ? `${PLATFORM_BADGE[p].bg} border-current ${PLATFORM_BADGE[p].text}`
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {PLATFORM_BADGE[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {platformAccounts.length > 0 && (
                <div>
                  <Label>Ad Account</Label>
                  <select
                    value={form.accountId}
                    onChange={(e) => set('accountId', parseInt(e.target.value))}
                    className={inputCls}
                  >
                    {platformAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.platform_account_id})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label required>Campaign Name</Label>
                <input
                  value={form.campaignName}
                  onChange={(e) => set('campaignName', e.target.value)}
                  placeholder="e.g. Spring Sale 2026"
                  className={inputCls}
                />
              </div>

              <div>
                <Label>Objective</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {objectives.map(o => (
                    <button
                      key={o.value}
                      onClick={() => set('objective', o.value)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left ${
                        form.objective === o.value
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setStep(1)} className="w-full py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm font-semibold text-ats-text hover:bg-ats-hover transition-colors mt-2">
                Next: Ad Set Settings &rarr;
              </button>
            </div>
          )}

          {/* Step 1: Ad Set */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Ad Set Name</Label>
                <input
                  value={form.adsetName}
                  onChange={(e) => set('adsetName', e.target.value)}
                  placeholder={`${form.campaignName || 'Campaign'} - Ad Set`}
                  className={inputCls}
                />
                <Hint>Leave blank to auto-generate</Hint>
              </div>

              {/* Budget */}
              <div>
                <Label required>Budget</Label>
                <div className="flex gap-2 mb-2">
                  {(['daily', 'lifetime'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => set('budgetType', t)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        form.budgetType === t
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {t === 'daily' ? 'Daily' : 'Lifetime'}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                  <input
                    type="number"
                    min="5"
                    step="1"
                    value={form.dailyBudget}
                    onChange={(e) => set('dailyBudget', e.target.value)}
                    className={inputCls + " pl-7"}
                  />
                </div>
                <Hint>Minimum $5.00</Hint>
              </div>

              {/* Schedule */}
              <div>
                <Label>Schedule</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div>
                    <span className="text-[10px] text-ats-text-muted block mb-1">Start</span>
                    <input type="datetime-local" value={form.scheduleStart} onChange={(e) => set('scheduleStart', e.target.value)} className={inputSmCls} />
                  </div>
                  <div>
                    <span className="text-[10px] text-ats-text-muted block mb-1">End</span>
                    <input type="datetime-local" value={form.scheduleEnd} onChange={(e) => set('scheduleEnd', e.target.value)} className={inputSmCls} />
                  </div>
                </div>
                <Hint>Leave blank to start immediately</Hint>
              </div>

              {/* Event to Track */}
              <div>
                <Label>Event to Track</Label>
                <select value={form.eventType} onChange={(e) => set('eventType', e.target.value)} className={inputCls}>
                  <option value="">None (default)</option>
                  {EVENTS.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
                </select>
              </div>

              {/* Placements */}
              <div>
                <Label>Platform Placements</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {NB_PLACEMENTS.map(p => (
                    <label key={p.value} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border cursor-pointer transition-all ${
                      form.placements.includes(p.value)
                        ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                        : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.placements.includes(p.value)}
                        onChange={(e) => {
                          if (p.value === 'ALL') {
                            set('placements', e.target.checked ? ['ALL'] : []);
                          } else {
                            const next = e.target.checked
                              ? [...form.placements.filter(v => v !== 'ALL'), p.value]
                              : form.placements.filter(v => v !== p.value);
                            set('placements', next.length === 0 ? ['ALL'] : next);
                          }
                        }}
                        className="accent-ats-accent"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Targeting Section */}
              <SectionDivider label="Targeting" />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Gender</Label>
                  <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inputSmCls}>
                    <option value="all">All</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <Label>Age Min</Label>
                  <select value={form.ageMin} onChange={(e) => set('ageMin', e.target.value)} className={inputSmCls}>
                    {Array.from({ length: 48 }, (_, i) => i + 18).map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Age Max</Label>
                  <select value={form.ageMax} onChange={(e) => set('ageMax', e.target.value)} className={inputSmCls}>
                    {Array.from({ length: 48 }, (_, i) => i + 18).map(a => (
                      <option key={a} value={a}>{a}{a === 65 ? '+' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label>Locations</Label>
                <input
                  value={form.locations}
                  onChange={(e) => set('locations', e.target.value)}
                  placeholder="US, CA, UK (comma-separated)"
                  className={inputCls}
                />
                <Hint>Country codes or city names, comma-separated</Hint>
              </div>

              <div>
                <Label>Languages</Label>
                <input
                  value={form.languages}
                  onChange={(e) => set('languages', e.target.value)}
                  placeholder="en, es (comma-separated)"
                  className={inputCls}
                />
              </div>

              <div>
                <Label>Audience List</Label>
                <input
                  value={form.audienceList}
                  onChange={(e) => set('audienceList', e.target.value)}
                  placeholder="Audience ID or name"
                  className={inputCls}
                />
                <Hint>Include a custom audience by ID</Hint>
              </div>

              {/* Optimization & Bidding */}
              <SectionDivider label="Optimization & Bidding" />

              <div>
                <Label>Optimization Goal</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {[
                    { v: 'CONVERSIONS', l: 'Conversions' },
                    { v: 'CONVERSION_VALUE', l: 'Conversion Value' },
                    { v: 'CLICKS', l: 'Link Clicks' },
                    { v: 'IMPRESSIONS', l: 'Impressions' },
                  ].map(o => (
                    <button
                      key={o.v}
                      onClick={() => set('optimizationGoal', o.v)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        form.optimizationGoal === o.v
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Bid Strategy</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {[
                    { v: 'LOWEST_COST_WITHOUT_CAP', l: 'Max Conversions (Auto)' },
                    { v: 'COST_CAP', l: 'Target CPA' },
                  ].map(o => (
                    <button
                      key={o.v}
                      onClick={() => set('bidType', o.v)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        form.bidType === o.v
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                {form.bidType === 'COST_CAP' && (
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.bidAmount}
                      onChange={(e) => set('bidAmount', e.target.value)}
                      placeholder="Target CPA"
                      className={inputCls + " pl-7"}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover transition-colors">
                  &larr; Back
                </button>
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm font-semibold text-ats-text hover:bg-ats-hover transition-colors">
                  Next: Creative &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Creative */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Ad Name</Label>
                <input
                  value={form.adName}
                  onChange={(e) => set('adName', e.target.value)}
                  placeholder={`${form.campaignName || 'Campaign'} - Ad`}
                  className={inputCls}
                />
              </div>

              {/* Media */}
              <div>
                <Label>Media</Label>
                <div className="flex gap-2 mt-1.5 mb-2">
                  {(['image', 'video'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { set('mediaType', t); set('mediaUrl', ''); setMediaPreview(null); }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                        form.mediaType === t
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {t === 'image' ? <ImageIcon className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                      {t === 'image' ? 'Image' : 'Video'}
                    </button>
                  ))}
                </div>

                {mediaPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-ats-border">
                    {form.mediaType === 'video' ? (
                      <video src={mediaPreview} className="w-full h-44 object-cover" controls muted />
                    ) : (
                      <img src={mediaPreview} alt="Creative" className="w-full h-44 object-cover" />
                    )}
                    <button
                      onClick={() => { setMediaPreview(null); set('mediaUrl', ''); }}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 h-36 rounded-xl border-2 border-dashed border-ats-border hover:border-ats-accent/50 cursor-pointer transition-colors bg-ats-card/50">
                    <input
                      type="file"
                      accept={form.mediaType === 'video' ? 'video/mp4,video/quicktime' : 'image/*'}
                      onChange={handleMediaUpload}
                      className="hidden"
                    />
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-ats-text-muted animate-spin" />
                    ) : (
                      <>
                        {form.mediaType === 'video' ? <Film className="w-6 h-6 text-ats-text-muted" /> : <ImageIcon className="w-6 h-6 text-ats-text-muted" />}
                        <span className="text-xs text-ats-text-muted">
                          Upload {form.mediaType === 'video' ? 'video (MP4, MOV)' : 'image (JPG, PNG, GIF)'}
                        </span>
                        <span className="text-[10px] text-ats-text-muted/50">
                          Max {form.mediaType === 'video' ? '500MB' : '30MB'}
                        </span>
                      </>
                    )}
                  </label>
                )}
                {!mediaPreview && (
                  <input
                    value={form.mediaUrl}
                    onChange={(e) => set('mediaUrl', e.target.value)}
                    placeholder={`or paste ${form.mediaType} URL`}
                    className={inputSmCls + " mt-2"}
                  />
                )}
              </div>

              {/* Thumbnail Cover (for video) */}
              {form.mediaType === 'video' && (
                <div>
                  <Label>Thumbnail Cover</Label>
                  {thumbPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-ats-border w-32 h-20">
                      <img src={thumbPreview} alt="Thumb" className="w-full h-full object-cover" />
                      <button onClick={() => { setThumbPreview(null); set('thumbnailUrl', ''); }} className="absolute top-1 right-1 p-1 bg-black/60 rounded text-white"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 h-20 w-32 rounded-lg border-2 border-dashed border-ats-border hover:border-ats-accent/50 cursor-pointer bg-ats-card/50">
                      <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                      <ImageIcon className="w-4 h-4 text-ats-text-muted" />
                      <span className="text-[10px] text-ats-text-muted">Max 5MB</span>
                    </label>
                  )}
                </div>
              )}

              {/* Headline with dynamic vars */}
              <div>
                <Label>Headline</Label>
                <DynVarBar onInsert={(v) => insertVar(headlineRef, 'headline', v)} />
                <input
                  ref={headlineRef}
                  value={form.headline}
                  onChange={(e) => set('headline', e.target.value)}
                  placeholder="Short, attention-grabbing headline"
                  maxLength={90}
                  className={inputCls}
                />
                <CharCount current={form.headline.length} max={90} />
              </div>

              {/* Description/Ad Text with dynamic vars */}
              <div>
                <Label required>Description</Label>
                <DynVarBar onInsert={(v) => insertVar(adTextRef, 'adText', v)} />
                <textarea
                  ref={adTextRef}
                  value={form.adText}
                  onChange={(e) => set('adText', e.target.value)}
                  placeholder="Your primary ad copy"
                  rows={3}
                  maxLength={90}
                  className={inputCls + " resize-none"}
                />
                <CharCount current={form.adText.length} max={90} />
              </div>

              {/* Brand Name */}
              <div>
                <Label>Brand Name</Label>
                <input
                  value={form.brandName}
                  onChange={(e) => set('brandName', e.target.value)}
                  placeholder="Your brand name"
                  className={inputCls}
                />
              </div>

              {/* Button Text */}
              <div>
                <Label>Button Text</Label>
                <input
                  value={form.buttonText}
                  onChange={(e) => set('buttonText', e.target.value)}
                  placeholder="Custom button text (e.g. Shop Now)"
                  className={inputCls}
                />
              </div>

              {/* Landing URL */}
              <div>
                <Label>Landing Page URL</Label>
                <input
                  value={form.landingUrl}
                  onChange={(e) => set('landingUrl', e.target.value)}
                  placeholder="https://yoursite.com/offer"
                  className={inputCls}
                />
              </div>

              {/* CTA */}
              <div>
                <Label>Call to Action Preset</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {CTA_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => set('cta', c)}
                      className={`px-2 py-2 rounded-lg text-[10px] font-semibold border transition-all ${
                        form.cta === c
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {c.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result */}
              {result && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${
                  result.success ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
                }`}>
                  {result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{result.success ? 'Campaign live! Refreshing...' : result.error}</span>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(1)} className="py-2.5 px-4 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover transition-colors">
                  &larr;
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing || !canPublish}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-ats-accent text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {publishing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
                  ) : (
                    <><Rocket className="w-4 h-4" /> Publish to {PLATFORM_BADGE[form.platform]?.label}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer summary */}
        <div className="shrink-0 border-t border-ats-border px-5 py-3 flex items-center gap-3 text-[11px] text-ats-text-muted bg-ats-card/50">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PLATFORM_BADGE[form.platform]?.bg} ${PLATFORM_BADGE[form.platform]?.text}`}>
            {PLATFORM_BADGE[form.platform]?.label}
          </span>
          {form.campaignName && <span className="truncate">{form.campaignName}</span>}
          <span className="ml-auto">{fmt$(parseFloat(form.dailyBudget) || 0)}/{form.budgetType === 'daily' ? 'day' : 'total'}</span>
        </div>
      </div>
    </div>
  );
}

// ── Format Launcher Modal ──────────────────────────────────

function FormatLauncher({ onClose, onSuccess, accounts }: {
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
}) {
  const [format, setFormat] = useState('1-1-1');
  const [customFormat, setCustomFormat] = useState('');
  const [platform, setPlatform] = useState('newsbreak');
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('TRAFFIC');
  // Ad set settings
  const [dailyBudget, setDailyBudget] = useState('10');
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily');
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [eventType, setEventType] = useState('');
  const [batchPlacements, setBatchPlacements] = useState<string[]>(['ALL']);
  const [gender, setGender] = useState('all');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [locations, setLocations] = useState('');
  const [languages, setLanguages] = useState('');
  const [audienceList, setAudienceList] = useState('');
  const [optimizationGoal, setOptimizationGoal] = useState('CONVERSIONS');
  const [bidType, setBidType] = useState('LOWEST_COST_WITHOUT_CAP');
  const [bidAmount, setBidAmount] = useState('');
  // Creative settings
  const [headline, setHeadline] = useState('');
  const [adText, setAdText] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [brandName, setBrandName] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mediaIds, setMediaIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [batchStep, setBatchStep] = useState(0); // 0 = format+campaign, 1 = ad set, 2 = creative

  const platformAccounts = accounts.filter(a => a.platform === platform && a.status === 'active');
  const objectives = OBJECTIVES[platform] || OBJECTIVES.newsbreak;

  useEffect(() => {
    const accts = accounts.filter(a => a.platform === platform && a.status === 'active');
    setAccountId(accts[0]?.id);
  }, [platform, accounts]);

  const effectiveFormat = format === 'custom' ? customFormat : format;
  const parts = effectiveFormat.split('-').map(Number);
  const valid = parts.length === 3 && parts.every(n => n >= 1 && n <= 10);
  const totalAds = valid ? parts[0] * parts[1] * parts[2] : 0;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;
    setUploading(true);
    const ids: number[] = [...mediaIds];
    for (const f of newFiles) {
      try {
        const res = await uploadCampaignMedia(f, accountId);
        ids.push(res.id);
      } catch (err: any) {
        alert(`Failed to upload ${f.name}: ${err.message}`);
      }
    }
    setMediaIds(ids);
    setFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
  }

  async function handleLaunch() {
    if (!campaignName.trim()) { alert('Campaign name is required'); return; }
    if (!valid) { alert('Invalid format'); return; }

    setLaunching(true);
    setResult(null);
    try {
      const targeting: Record<string, any> = {};
      if (gender !== 'all') targeting.gender = gender;
      if (ageMin) targeting.age_min = parseInt(ageMin);
      if (ageMax) targeting.age_max = parseInt(ageMax);
      if (locations.trim()) targeting.locations = locations.split(',').map(s => s.trim()).filter(Boolean);
      if (languages.trim()) targeting.languages = languages.split(',').map(s => s.trim()).filter(Boolean);
      if (audienceList.trim()) targeting.audience_list = audienceList.trim();

      const res = await batchCreateCampaign({
        format: effectiveFormat,
        platform,
        account_id: accountId,
        campaign_name: campaignName.trim(),
        objective,
        adset_config: {
          daily_budget: parseFloat(dailyBudget) || 10,
          budget_type: budgetType,
          bid_type: bidType,
          bid_amount: bidAmount ? parseFloat(bidAmount) : undefined,
          optimization_goal: optimizationGoal,
          targeting: Object.keys(targeting).length > 0 ? targeting : undefined,
          placements: batchPlacements.includes('ALL') ? undefined : batchPlacements,
          event_type: eventType || undefined,
          schedule_start: scheduleStart || undefined,
          schedule_end: scheduleEnd || undefined,
        },
        creative_config: {
          headline: headline.trim() || undefined,
          primary_text: adText.trim() || undefined,
          link_url: landingUrl.trim() || undefined,
          cta: cta,
          brand_name: brandName.trim() || undefined,
          button_text: buttonText.trim() || undefined,
        },
        media_ids: mediaIds.length > 0 ? mediaIds : undefined,
        auto_publish: true,
      });
      setResult({ success: res.success });
      if (res.success) {
        setTimeout(() => { onSuccess(); onClose(); }, 1200);
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setLaunching(false);
    }
  }

  const inputCls = "w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent";
  const inputSmCls = inputCls + " text-xs";
  const pillActive = 'bg-ats-accent/15 border-ats-accent text-ats-accent';
  const pillInactive = 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ats-bg border border-ats-border rounded-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 border-b border-ats-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ats-text flex items-center gap-2">
              <Layers className="w-5 h-5 text-ats-accent" />
              Format Template Launcher
            </h2>
            <p className="text-[11px] text-ats-text-muted mt-0.5">Launch campaigns in bulk using a format template</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted"><X className="w-5 h-5" /></button>
        </div>

        {/* Step tabs */}
        <div className="shrink-0 flex border-b border-ats-border">
          {['Format & Campaign', 'Ad Set', 'Creative & Media'].map((label, i) => (
            <button
              key={label}
              onClick={() => setBatchStep(i)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                batchStep === i
                  ? 'text-ats-accent border-ats-accent'
                  : 'text-ats-text-muted border-transparent hover:text-ats-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step 0: Format & Campaign ─────────────────── */}
          {batchStep === 0 && (<>
            <div>
              <Label>Campaign Format</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {FORMAT_PRESETS.map(f => (
                  <button
                    key={f.format}
                    onClick={() => setFormat(f.format)}
                    className={`px-3 py-3 rounded-lg border transition-all text-center ${format === f.format ? pillActive : pillInactive}`}
                  >
                    <div className="text-sm font-bold">{f.label}</div>
                    <div className="text-[9px] mt-0.5 opacity-70">{f.desc}</div>
                  </button>
                ))}
                <button
                  onClick={() => setFormat('custom')}
                  className={`px-3 py-3 rounded-lg border transition-all text-center ${format === 'custom' ? pillActive : pillInactive}`}
                >
                  <div className="text-sm font-bold">Custom</div>
                  <div className="text-[9px] mt-0.5 opacity-70">Your own format</div>
                </button>
              </div>
              {format === 'custom' && (
                <input value={customFormat} onChange={(e) => setCustomFormat(e.target.value)} placeholder="e.g. 1-5-2" className={inputCls + " mt-2 text-center font-mono"} />
              )}
              {valid && (
                <div className="mt-2 text-xs text-ats-text-muted bg-ats-card/50 rounded-lg px-3 py-2">
                  Will create: <strong>{parts[0]}</strong> campaign{parts[0] > 1 ? 's' : ''} &times; <strong>{parts[1]}</strong> ad set{parts[1] > 1 ? 's' : ''} &times; <strong>{parts[2]}</strong> ad{parts[2] > 1 ? 's' : ''} each = <strong>{totalAds}</strong> total ads
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Platform</Label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
                  {['newsbreak', 'meta', 'tiktok'].map(p => <option key={p} value={p}>{PLATFORM_BADGE[p].label}</option>)}
                </select>
              </div>
              <div>
                <Label>Account</Label>
                <select value={accountId} onChange={(e) => setAccountId(parseInt(e.target.value))} className={inputCls}>
                  {platformAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Label required>Campaign Name</Label>
              <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Spring Sale Batch" className={inputCls} />
            </div>

            <div>
              <Label>Objective</Label>
              <select value={objective} onChange={(e) => setObjective(e.target.value)} className={inputCls}>
                {objectives.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <button onClick={() => setBatchStep(1)} className="w-full py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm font-semibold text-ats-text hover:bg-ats-hover transition-colors mt-2">
              Next: Ad Set Settings &rarr;
            </button>
          </>)}

          {/* ── Step 1: Ad Set Settings ──────────────────── */}
          {batchStep === 1 && (<>
            {/* Budget */}
            <div>
              <Label required>Budget</Label>
              <div className="flex gap-2 mb-2">
                {(['daily', 'lifetime'] as const).map(t => (
                  <button key={t} onClick={() => setBudgetType(t)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${budgetType === t ? pillActive : pillInactive}`}>
                    {t === 'daily' ? 'Daily' : 'Lifetime'}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                <input type="number" min="5" step="1" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className={inputCls + " pl-7"} />
              </div>
              <Hint>Minimum $5.00</Hint>
            </div>

            {/* Schedule */}
            <div>
              <Label>Schedule</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <div>
                  <span className="text-[10px] text-ats-text-muted block mb-1">Start</span>
                  <input type="datetime-local" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className={inputSmCls} />
                </div>
                <div>
                  <span className="text-[10px] text-ats-text-muted block mb-1">End</span>
                  <input type="datetime-local" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className={inputSmCls} />
                </div>
              </div>
            </div>

            {/* Event to Track */}
            <div>
              <Label>Event to Track</Label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputCls}>
                <option value="">None (default)</option>
                {EVENTS.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
              </select>
            </div>

            {/* Placements */}
            <div>
              <Label>Platform Placements</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {NB_PLACEMENTS.map(p => (
                  <label key={p.value} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border cursor-pointer transition-all ${
                    batchPlacements.includes(p.value) ? pillActive : pillInactive
                  }`}>
                    <input
                      type="checkbox"
                      checked={batchPlacements.includes(p.value)}
                      onChange={(e) => {
                        if (p.value === 'ALL') {
                          setBatchPlacements(e.target.checked ? ['ALL'] : []);
                        } else {
                          const next = e.target.checked
                            ? [...batchPlacements.filter(v => v !== 'ALL'), p.value]
                            : batchPlacements.filter(v => v !== p.value);
                          setBatchPlacements(next.length === 0 ? ['ALL'] : next);
                        }
                      }}
                      className="accent-ats-accent"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Targeting */}
            <SectionDivider label="Targeting" />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Gender</Label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputSmCls}>
                  <option value="all">All</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <Label>Age Min</Label>
                <select value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className={inputSmCls}>
                  {Array.from({ length: 48 }, (_, i) => i + 18).map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Age Max</Label>
                <select value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className={inputSmCls}>
                  {Array.from({ length: 48 }, (_, i) => i + 18).map(a => (
                    <option key={a} value={a}>{a}{a === 65 ? '+' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Locations</Label>
              <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="US, CA, UK (comma-separated)" className={inputCls} />
            </div>

            <div>
              <Label>Languages</Label>
              <input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es (comma-separated)" className={inputCls} />
            </div>

            <div>
              <Label>Audience List</Label>
              <input value={audienceList} onChange={(e) => setAudienceList(e.target.value)} placeholder="Audience ID or name" className={inputCls} />
            </div>

            {/* Optimization & Bidding */}
            <SectionDivider label="Optimization & Bidding" />

            <div>
              <Label>Optimization Goal</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {[
                  { v: 'CONVERSIONS', l: 'Conversions' },
                  { v: 'CONVERSION_VALUE', l: 'Conversion Value' },
                  { v: 'CLICKS', l: 'Link Clicks' },
                  { v: 'IMPRESSIONS', l: 'Impressions' },
                ].map(o => (
                  <button key={o.v} onClick={() => setOptimizationGoal(o.v)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${optimizationGoal === o.v ? pillActive : pillInactive}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Bid Strategy</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {[
                  { v: 'LOWEST_COST_WITHOUT_CAP', l: 'Max Conversions (Auto)' },
                  { v: 'COST_CAP', l: 'Target CPA' },
                ].map(o => (
                  <button key={o.v} onClick={() => setBidType(o.v)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${bidType === o.v ? pillActive : pillInactive}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {bidType === 'COST_CAP' && (
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                  <input type="number" min="0.01" step="0.01" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="Target CPA" className={inputCls + " pl-7"} />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={() => setBatchStep(0)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover transition-colors">
                &larr; Back
              </button>
              <button onClick={() => setBatchStep(2)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm font-semibold text-ats-text hover:bg-ats-hover transition-colors">
                Next: Creative &rarr;
              </button>
            </div>
          </>)}

          {/* ── Step 2: Creative & Media ─────────────────── */}
          {batchStep === 2 && (<>
            <div>
              <Label>Headline</Label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Ad headline" maxLength={90} className={inputCls} />
              <CharCount current={headline.length} max={90} />
            </div>
            <div>
              <Label>Ad Text / Description</Label>
              <input value={adText} onChange={(e) => setAdText(e.target.value)} placeholder="Primary ad text" maxLength={90} className={inputCls} />
              <CharCount current={adText.length} max={90} />
            </div>

            <div>
              <Label>Brand Name</Label>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Your brand name" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Landing URL</Label>
                <input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>
              <div>
                <Label>Button Text</Label>
                <input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Shop Now" className={inputCls} />
              </div>
            </div>

            <div>
              <Label>CTA Preset</Label>
              <select value={cta} onChange={(e) => setCta(e.target.value)} className={inputCls}>
                {CTA_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Batch file upload */}
            <SectionDivider label="Batch Media Upload" />
            <div>
              <label className="flex items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-ats-border hover:border-ats-accent/50 cursor-pointer transition-colors bg-ats-card/50">
                <input type="file" accept="image/*,video/mp4,video/quicktime" multiple onChange={handleFileUpload} className="hidden" />
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-ats-text-muted animate-spin" />
                ) : (
                  <div className="text-center">
                    <div className="text-xs text-ats-text-muted">Drop or click to upload multiple files</div>
                    <div className="text-[10px] text-ats-text-muted/50 mt-1">Files will be distributed round-robin across ads</div>
                  </div>
                )}
              </label>
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {files.map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-ats-card border border-ats-border rounded text-[10px] text-ats-text-muted">
                      {f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${
                result.success ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{result.success ? 'Batch launched! Refreshing...' : result.error}</span>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={() => setBatchStep(1)} className="py-2.5 px-4 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover transition-colors">
                &larr;
              </button>
              <button
                onClick={handleLaunch}
                disabled={launching || !valid || !campaignName.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-ats-accent text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {launching ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching...</> : <><Zap className="w-4 h-4" /> Launch {totalAds} Ads</>}
              </button>
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-ats-border px-6 py-3 flex items-center gap-3 text-[11px] text-ats-text-muted bg-ats-card/50">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PLATFORM_BADGE[platform]?.bg} ${PLATFORM_BADGE[platform]?.text}`}>
            {PLATFORM_BADGE[platform]?.label}
          </span>
          {campaignName && <span className="truncate">{campaignName}</span>}
          <span className="ml-auto font-mono">{effectiveFormat}</span>
          <span>{fmt$(parseFloat(dailyBudget) || 0)}/{budgetType === 'daily' ? 'day' : 'total'}</span>
        </div>
      </div>
    </div>
  );
}

// ── Tiny helpers ────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs text-ats-text-muted mb-1.5 font-medium">
      {children}{required && <span className="text-ats-red ml-0.5">*</span>}
    </label>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="text-[10px] text-ats-text-muted/60 mt-1">{children}</p>;
}

function CharCount({ current, max }: { current: number; max: number }) {
  const warn = current > max * 0.85;
  return <p className={`text-[10px] mt-1 text-right ${warn ? 'text-yellow-400' : 'text-ats-text-muted/60'}`}>{current}/{max}</p>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex-1 h-px bg-ats-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ats-text-muted">{label}</span>
      <div className="flex-1 h-px bg-ats-border" />
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function LiveCampaignsPage() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [showCreator, setShowCreator] = useState(false);
  const [showFormatLauncher, setShowFormatLauncher] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string } | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  // Date range
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const toIso = (d: Date) => d.toISOString().split('T')[0];

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    load();
    fetchAccounts().then(setAccounts).catch(() => {});
  }, [platformFilter, accountFilter, dateRange]);

  // Reset account filter when platform changes (so user doesn't get stuck on a meta account while viewing newsbreak)
  useEffect(() => {
    setAccountFilter('all');
  }, [platformFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    setExpanded({});
    setExpandedAds({});
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      setCampaigns(await fetchLiveCampaigns(platformFilter, startDate, endDate, accountFilter));
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const av = (a as any)[sortKey];
    const bv = (b as any)[sortKey];
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  async function toggleCampaign(c: LiveCampaign) {
    const key = `${c.platform}:${c.campaign_id}`;
    if (expanded[key] && expanded[key] !== 'loading') {
      setExpanded(p => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setExpanded(p => ({ ...p, [key]: 'loading' }));
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      const data = await fetchLiveAdsets(c.platform, c.campaign_id, startDate, endDate);
      setExpanded(p => ({ ...p, [key]: data }));
    } catch {
      setExpanded(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  async function toggleAdset(platform: string, adsetId: string) {
    const key = `${platform}:${adsetId}`;
    if (expandedAds[key] && expandedAds[key] !== 'loading') {
      setExpandedAds(p => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setExpandedAds(p => ({ ...p, [key]: 'loading' }));
    try {
      const startDate = dateRange.isToday ? undefined : toIso(dateRange.from);
      const endDate = dateRange.isToday ? undefined : toIso(dateRange.to);
      const data = await fetchLiveAds(platform, adsetId, startDate, endDate);
      setExpandedAds(p => ({ ...p, [key]: data }));
    } catch {
      setExpandedAds(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  async function handleStatus(platform: string, entityType: string, entityId: string, enable: boolean) {
    const key = `status:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityStatus(platform, entityType, entityId, enable ? 'ENABLE' : 'DISABLE');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleBudgetSubmit() {
    if (!budgetModal) return;
    const val = parseFloat(budgetValue);
    if (isNaN(val) || val < 5) { alert('Minimum $5.00'); return; }
    const key = `budget:${budgetModal.entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityBudget(budgetModal.platform, budgetModal.entityId, val);
      setBudgetModal(null); setBudgetValue('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function handleDuplicate(entityType: string, entityId: number) {
    const key = `dup:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await duplicateLiveEntity(entityType, entityId);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  // Loading skeleton
  if (loading && campaigns.length === 0) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns" showDatePicker>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />)}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns" showDatePicker>
        <div className="px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  const totals = campaigns.reduce(
    (a, c) => ({ spend: a.spend + c.spend, conv: a.conv + c.conversions, rev: a.rev + c.conversion_value }),
    { spend: 0, conv: 0, rev: 0 }
  );

  return (
    <PageShell
      title="Campaign Manager"
      subtitle="Create, monitor & manage your campaigns"
      showDatePicker
      actions={
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-ats-text-muted hover:bg-ats-hover transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowFormatLauncher(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors"
            title="Format Template Launcher"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Batch</span>
          </button>
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Campaigns" value={String(campaigns.length)} />
        <Stat label={dateRange.isToday ? "Today's Spend" : 'Total Spend'} value={fmt$(totals.spend)} />
        <Stat label="Conversions" value={fmtNum(totals.conv)} />
        <Stat label="Revenue" value={fmt$(totals.rev)} cls="text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', 'meta', 'tiktok', 'newsbreak'].map(p => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              platformFilter === p
                ? 'bg-ats-accent/20 border-ats-accent text-ats-accent'
                : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            {PLATFORM_BADGE[p]?.label}
          </button>
        ))}

        {/* Account selector — always show when accounts exist */}
        {(() => {
          const filteredAccounts = platformFilter === 'all'
            ? accounts.filter(a => a.status === 'active')
            : accounts.filter(a => a.platform === platformFilter && a.status === 'active');
          if (filteredAccounts.length === 0) return null;
          return (
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-ats-card border-ats-border text-ats-text hover:bg-ats-hover transition-colors focus:outline-none focus:border-ats-accent ml-1"
            >
              <option value="all">All Accounts</option>
              {filteredAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name || a.platform_account_id}{platformFilter === 'all' ? ` (${PLATFORM_BADGE[a.platform]?.label || a.platform})` : ''}
                </option>
              ))}
            </select>
          );
        })()}

        {loading && <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin ml-1" />}
      </div>

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="w-12 h-12 text-ats-text-muted mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-ats-text mb-1">No active campaigns</h3>
          <p className="text-sm text-ats-text-muted max-w-sm mb-6">
            Create your first campaign to start driving results.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowFormatLauncher(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-ats-card border border-ats-border text-ats-text rounded-lg text-sm font-semibold hover:bg-ats-hover"
            >
              <Layers className="w-4 h-4" /> Batch Launch
            </button>
            <button
              onClick={() => setShowCreator(true)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Create Campaign
            </button>
          </div>
        </div>
      ) : (
        /* Campaign table */
        <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <TH className="w-8" />
                <SortTH label="Campaign" sortKey="campaign_name" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <TH align="left" hide="md">Platform</TH>
                <SortTH label="Spend" sortKey="spend" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="Clicks" sortKey="clicks" currentKey={sortKey} dir={sortDir} onSort={handleSort} hide="sm" />
                <SortTH label="Impr." sortKey="impressions" currentKey={sortKey} dir={sortDir} onSort={handleSort} hide="lg" />
                <SortTH label="Conv." sortKey="conversions" currentKey={sortKey} dir={sortDir} onSort={handleSort} hide="md" />
                <SortTH label="Revenue" sortKey="conversion_value" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="ROAS" sortKey="roas" currentKey={sortKey} dir={sortDir} onSort={handleSort} hide="sm" />
                <TH className="w-24">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.map(c => {
                const key = `${c.platform}:${c.campaign_id}`;
                const adsets = expanded[key];
                const isExpanded = adsets && adsets !== 'loading';
                const isLoading = adsets === 'loading';

                return (
                  <Fragment key={key}>
                    <tr className="border-b border-ats-border/50 hover:bg-ats-hover/50 transition-colors cursor-pointer" onClick={() => toggleCampaign(c)}>
                      <td className="px-4 py-3">
                        {isLoading ? <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" /> :
                          isExpanded ? <ChevronDown className="w-4 h-4 text-ats-text-muted" /> : <ChevronRight className="w-4 h-4 text-ats-text-muted" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ats-text">{c.campaign_name || c.campaign_id}</div>
                        <div className="text-[11px] text-ats-text-muted">{c.account_name} &middot; {c.adset_count} adsets &middot; {c.ad_count} ads</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PLATFORM_BADGE[c.platform]?.bg} ${PLATFORM_BADGE[c.platform]?.text}`}>
                          {PLATFORM_BADGE[c.platform]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ats-text">{fmt$(c.spend)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden sm:table-cell">{fmtNum(c.clicks)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden lg:table-cell">{fmtNum(c.impressions)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden md:table-cell">{fmtNum(c.conversions)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt$(c.conversion_value)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted hidden sm:table-cell">{fmtRoas(c.roas)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {actionLoading[`status:campaign:${c.campaign_id}`] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" />
                          ) : (
                            <button onClick={() => handleStatus(c.platform, 'campaign', c.campaign_id, false)} className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors" title="Pause">
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicate('campaign', parseInt(c.campaign_id))}
                            disabled={actionLoading[`dup:campaign:${c.campaign_id}`]}
                            className="p-1.5 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400 transition-colors"
                            title="Duplicate"
                          >
                            {actionLoading[`dup:campaign:${c.campaign_id}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Adsets */}
                    {isExpanded && (adsets as LiveAdset[]).map(as => {
                      const asKey = `${c.platform}:${as.adset_id}`;
                      const ads = expandedAds[asKey];
                      const adsOpen = ads && ads !== 'loading';

                      return (
                        <Fragment key={`as-${asKey}`}>
                          <tr className="border-b border-ats-border/30 bg-ats-bg/50 hover:bg-ats-hover/30 cursor-pointer" onClick={() => toggleAdset(c.platform, as.adset_id)}>
                            <td className="px-4 py-2.5 pl-10">
                              {ads === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" /> :
                                adsOpen ? <ChevronDown className="w-3.5 h-3.5 text-ats-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-ats-text-muted" />}
                            </td>
                            <td className="px-4 py-2.5"><span className="text-sm text-ats-text">{as.adset_name || as.adset_id}</span><span className="text-[10px] text-ats-text-muted ml-2">{as.ad_count} ads</span></td>
                            <td className="hidden md:table-cell" />
                            <td className="px-4 py-2.5 text-right font-mono text-ats-text text-xs">{fmt$(as.spend)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden sm:table-cell">{fmtNum(as.clicks)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden lg:table-cell">{fmtNum(as.impressions)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden md:table-cell">{fmtNum(as.conversions)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-400 text-xs">{fmt$(as.conversion_value)}</td>
                            <td className="hidden sm:table-cell" />
                            <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {actionLoading[`status:adset:${as.adset_id}`] ? <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" /> : (
                                  <>
                                    <button onClick={() => handleStatus(c.platform, 'adset', as.adset_id, false)} className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400" title="Pause"><Pause className="w-3 h-3" /></button>
                                    <button
                                      onClick={() => { setBudgetModal({ platform: c.platform, entityId: as.adset_id }); setBudgetValue(''); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold transition-colors"
                                      title="Adjust Budget"
                                    >
                                      <DollarSign className="w-3 h-3" />
                                      <span className="hidden sm:inline">Budget</span>
                                    </button>
                                    <button
                                      onClick={() => handleDuplicate('adset', parseInt(as.adset_id))}
                                      disabled={actionLoading[`dup:adset:${as.adset_id}`]}
                                      className="p-1.5 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400"
                                      title="Duplicate"
                                    >
                                      {actionLoading[`dup:adset:${as.adset_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {adsOpen && (ads as LiveAd[]).map((ad, i) => (
                            <tr key={`ad-${i}`} className="border-b border-ats-border/20 bg-ats-bg/30">
                              <td className="px-4 py-2 pl-16" />
                              <td className="px-4 py-2"><span className="text-xs text-ats-text-muted">{ad.ad_name || ad.ad_id || 'Unnamed'}</span></td>
                              <td className="hidden md:table-cell" />
                              <td className="px-4 py-2 text-right font-mono text-ats-text text-[11px]">{fmt$(ad.spend)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden sm:table-cell">{fmtNum(ad.clicks)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden lg:table-cell">{fmtNum(ad.impressions)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden md:table-cell">{fmtNum(ad.conversions)}</td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[11px]">{fmt$(ad.conversion_value)}</td>
                              <td className="hidden sm:table-cell" />
                              <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                                {ad.ad_id && (
                                  <button
                                    onClick={() => handleDuplicate('ad', parseInt(ad.ad_id!))}
                                    disabled={actionLoading[`dup:ad:${ad.ad_id}`]}
                                    className="p-1 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400"
                                    title="Duplicate"
                                  >
                                    {actionLoading[`dup:ad:${ad.ad_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Budget modal */}
      {budgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setBudgetModal(null)}>
          <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-ats-text mb-4">Adjust Daily Budget</h3>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
              <input type="number" min="5" step="1" value={budgetValue} onChange={e => setBudgetValue(e.target.value)} placeholder="50" autoFocus
                className="w-full pl-7 pr-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent" />
              <Hint>Minimum $5.00</Hint>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBudgetModal(null)} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text">Cancel</button>
              <button onClick={handleBudgetSubmit} disabled={actionLoading[`budget:${budgetModal.entityId}`]}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {actionLoading[`budget:${budgetModal.entityId}`] ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign creator */}
      {showCreator && <CampaignCreator onClose={() => setShowCreator(false)} onSuccess={load} accounts={accounts} />}

      {/* Format launcher */}
      {showFormatLauncher && <FormatLauncher onClose={() => setShowFormatLauncher(false)} onSuccess={load} accounts={accounts} />}
    </PageShell>
  );
}

// ── Table helpers ────────────────────────────────────────────

function Stat({ label, value, cls = 'text-ats-text' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function TH({ children, align = 'right', hide, className = '' }: { children?: React.ReactNode; align?: 'left' | 'right'; hide?: string; className?: string }) {
  const hidden = hide ? `hidden ${hide}:table-cell` : '';
  const alignCls = align === 'left' ? 'text-left' : 'text-right';
  return (
    <th className={`${alignCls} px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium ${hidden} ${className}`}>
      {children}
    </th>
  );
}

function SortTH({ label, sortKey, currentKey, dir, onSort, align = 'right', hide }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  hide?: string;
}) {
  const active = sortKey === currentKey;
  const hidden = hide ? `hidden ${hide}:table-cell` : '';
  const alignCls = align === 'left' ? 'text-left' : 'text-right';
  return (
    <th
      className={`${alignCls} px-4 py-3 text-[11px] uppercase tracking-wide font-medium cursor-pointer select-none hover:text-ats-text transition-colors ${hidden} ${active ? 'text-ats-accent' : 'text-ats-text-muted'}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 rotate-180" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
