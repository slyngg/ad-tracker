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
  fetchAdGroupBudgets,
  fetchCampaignAccountMap,
  assignCampaignAccount,
  bulkAssignCampaignAccount,
  triggerPlatformSync,
  fetchActivityLog,
  fetchNewsBreakAudiences,
  createNBCustomAudience,
  uploadNBAudienceData,
  createNBLookalikeAudience,
  deleteNBAudience,
  fetchCampaignTemplates,
  LiveCampaign,
  LiveAdset,
  LiveAd,
  Account,
  AdGroupBudget,
  ActivityLogEntry,
  NewsBreakAudience,
  CampaignTemplate,
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
  Search,
  AlertTriangle,
  History,
  ArrowDown,
  ArrowUp,
  TrendingDown,
  TrendingUp,
  Users,
  Upload,
  Trash2,
  FileText,
  Sparkles,
} from 'lucide-react';
import PageShell from '../../components/shared/PageShell';
import { useDateRangeStore } from '../../stores/dateRangeStore';

// ── Constants ───────────────────────────────────────────────

const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  all:       { bg: '',                 text: '',                label: 'All' },
  meta:      { bg: 'bg-blue-500/15',   text: 'text-blue-400',   label: 'Meta' },
  tiktok:    { bg: 'bg-pink-500/15',   text: 'text-pink-400',   label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
  google:    { bg: 'bg-violet-500/15', text: 'text-violet-400', label: 'Google' },
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
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const headlineRef = useRef<HTMLInputElement>(null);
  const [nbAudiences, setNbAudiences] = useState<NewsBreakAudience[]>([]);
  useEffect(() => { if (form.platform === 'newsbreak') fetchNewsBreakAudiences().then(setNbAudiences).catch(() => {}); }, [form.platform]);
  const adTextRef = useRef<HTMLTextAreaElement>(null);

  // Load campaign templates on mount
  useEffect(() => {
    fetchCampaignTemplates()
      .then(t => { setTemplates(t); setTemplatesLoading(false); })
      .catch(() => setTemplatesLoading(false));
  }, []);

  function applyTemplate(t: CampaignTemplate) {
    const tgt = t.targeting || {};
    const bc = t.budget_config || {};
    const cc = t.creative_config || {};
    const cfg = t.config || {};
    // Determine platform from template config or objective prefix
    const plat = cfg.platform || (t.objective?.startsWith('OUTCOME_') ? 'meta' : 'newsbreak');
    const platAccounts = accounts.filter(a => a.platform === plat && a.status === 'active');
    setForm(f => ({
      ...f,
      platform: plat,
      accountId: platAccounts[0]?.id,
      campaignName: '',
      objective: t.objective || (OBJECTIVES[plat] || OBJECTIVES.newsbreak)[0]?.value || 'TRAFFIC',
      dailyBudget: String((bc.budget_cents || 2000) / 100),
      budgetType: bc.budget_type || 'daily',
      bidType: bc.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      ageMin: String(tgt.age_min || 18),
      ageMax: String(tgt.age_max || 65),
      gender: tgt.genders?.length === 1 ? tgt.genders[0] : 'all',
      locations: (tgt.locations || ['US']).join(', '),
      cta: cc.call_to_action_type || 'LEARN_MORE',
      landingUrl: cc.link_url || '',
      headline: cc.headline || '',
      adText: cc.primary_text || '',
      mediaType: cc.media_type === 'video' ? 'video' : 'image',
      optimizationGoal: bc.optimization_goal || cfg.optimization_goal || 'CONVERSIONS',
      eventType: cfg.conversion_event || '',
    }));
    setSelectedTemplateId(t.id);
    setShowTemplatePicker(false);
    setStep(0);
  }

  const platformAccounts = accounts
    .filter(a => a.platform === form.platform && a.status === 'active')
    .sort((a, b) => {
      // Real accounts (with platform_account_id + token) first
      const aReal = a.platform_account_id && a.has_access_token ? 1 : 0;
      const bReal = b.platform_account_id && b.has_access_token ? 1 : 0;
      return bReal - aReal;
    });
  const connectedAccounts = platformAccounts.filter(a => a.platform_account_id && a.has_access_token);
  const objectives = OBJECTIVES[form.platform] || OBJECTIVES.newsbreak;

  useEffect(() => {
    const accts = accounts
      .filter(a => a.platform === form.platform && a.status === 'active')
      .sort((a, b) => {
        const aReal = a.platform_account_id && a.has_access_token ? 1 : 0;
        const bReal = b.platform_account_id && b.has_access_token ? 1 : 0;
        return bReal - aReal;
      });
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
            <h2 className="text-base font-bold text-ats-text">
              {showTemplatePicker ? 'Start from a Template' : 'New Campaign'}
            </h2>
            <p className="text-[11px] text-ats-text-muted mt-0.5">
              {showTemplatePicker ? 'Pick a preset — targeting, budget & settings pre-filled' : 'Set up & publish in one go'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!showTemplatePicker && (
              <button
                onClick={() => setShowTemplatePicker(true)}
                className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted"
                title="Back to templates"
              >
                <FileText className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Template picker */}
        {showTemplatePicker ? (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-ats-text-muted" />
              </div>
            ) : (
              <div className="space-y-3">
                {templates.length > 0 && (
                  <>
                    {/* Group by platform */}
                    {['meta', 'newsbreak', 'tiktok', 'google'].map(plat => {
                      const platTemplates = templates.filter(t => {
                        const cfg = t.config || {};
                        if (plat === 'meta') return t.objective?.startsWith('OUTCOME_') && cfg.platform !== 'newsbreak' && cfg.platform !== 'tiktok' && cfg.platform !== 'google';
                        return cfg.platform === plat;
                      });
                      if (platTemplates.length === 0) return null;
                      const badge = PLATFORM_BADGE[plat] || { bg: 'bg-violet-500/15', text: 'text-violet-400', label: plat.charAt(0).toUpperCase() + plat.slice(1) };
                      return (
                        <Fragment key={plat}>
                          <div className="flex items-center gap-2 pt-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                            <div className="flex-1 h-px bg-ats-border" />
                          </div>
                          {platTemplates.map(t => {
                            const bc = t.budget_config || {};
                            const tgt = t.targeting || {};
                            const cc = t.creative_config || {};
                            const budgetLabel = `$${((bc.budget_cents || 2000) / 100).toFixed(0)}/day`;
                            const allObjs = Object.values(OBJECTIVES).flat();
                            const objLabel = allObjs.find(o => o.value === t.objective)?.label || t.objective || '';
                            const ageLabel = `${tgt.age_min || 18}-${tgt.age_max || 65}`;
                            const geoLabel = (tgt.locations || ['US']).join(', ');
                            const ctaLabel = (cc.call_to_action_type || 'LEARN_MORE').replace(/_/g, ' ');
                            const isRetargeting = t.config?.audience_type === 'retargeting';
                            const isLookalike = t.config?.audience_type === 'lookalike';
                            const isCBO = t.config?.campaign_budget_optimization;
                            const isVideo = cc.media_type === 'video';

                            return (
                              <button
                                key={t.id}
                                onClick={() => applyTemplate(t)}
                                className={`w-full text-left p-4 rounded-xl border transition-all hover:border-ats-accent/50 hover:bg-ats-accent/5 ${
                                  selectedTemplateId === t.id
                                    ? 'border-ats-accent bg-ats-accent/10'
                                    : 'border-ats-border bg-ats-card'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-semibold text-ats-text">{t.name}</span>
                                    </div>
                                    <p className="text-[11px] text-ats-text-muted leading-relaxed mb-2.5">{t.description}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                                        {objLabel}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                                        {budgetLabel}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-ats-hover text-ats-text-muted">
                                        {geoLabel} &middot; {ageLabel}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-ats-hover text-ats-text-muted">
                                        {ctaLabel}
                                      </span>
                                      {isRetargeting && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400">Retargeting</span>
                                      )}
                                      {isLookalike && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-400">Lookalike</span>
                                      )}
                                      {isCBO && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-pink-500/15 text-pink-400">CBO</span>
                                      )}
                                      {isVideo && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400">Video</span>
                                      )}
                                    </div>
                                  </div>
                                  <Sparkles className="w-4 h-4 text-ats-accent shrink-0 mt-1" />
                                </div>
                              </button>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </>
                )}

                {templates.length === 0 && !templatesLoading && (
                  <div className="text-center py-12">
                    <FileText className="w-8 h-8 text-ats-text-muted mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-ats-text-muted">No templates yet</p>
                  </div>
                )}

                {/* Start from scratch */}
                <button
                  onClick={() => { setShowTemplatePicker(false); setStep(0); }}
                  className="w-full text-left p-4 rounded-xl border border-dashed border-ats-border bg-transparent hover:border-ats-text-muted/30 hover:bg-ats-hover/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Plus className="w-5 h-5 text-ats-text-muted" />
                    <div>
                      <span className="text-sm font-semibold text-ats-text-muted">Start from Scratch</span>
                      <p className="text-[11px] text-ats-text-muted/70 mt-0.5">Configure everything manually</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        ) : (
        <>
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

              <div>
                <Label required>Ad Account</Label>
                {platformAccounts.length > 0 ? (
                  <>
                    <select
                      value={form.accountId}
                      onChange={(e) => set('accountId', parseInt(e.target.value))}
                      className={inputCls}
                    >
                      {platformAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.platform_account_id ? ` (${a.platform_account_id})` : ''}{!a.has_access_token ? ' — no token' : ''}
                        </option>
                      ))}
                    </select>
                    {connectedAccounts.length === 0 && platformAccounts.length > 0 && (
                      <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        No connected {PLATFORM_BADGE[form.platform]?.label} accounts. Go to Settings → Accounts to connect one with an access token.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-400">
                    <div className="flex items-center gap-1.5 font-semibold mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      No {PLATFORM_BADGE[form.platform]?.label} accounts found
                    </div>
                    <p className="text-ats-text-muted">Add an ad account in Settings → Accounts with your platform account ID and access token.</p>
                  </div>
                )}
              </div>

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
                <Label>Audience</Label>
                {form.platform === 'newsbreak' && nbAudiences.length > 0 ? (
                  <select
                    value={form.audienceList}
                    onChange={(e) => set('audienceList', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No audience (broad targeting)</option>
                    {nbAudiences.map(a => (
                      <option key={a.audience_id} value={a.audience_id}>
                        {a.audience_name} ({a.audience_type}{a.size ? ` - ${a.size.toLocaleString()}` : ''})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.audienceList}
                    onChange={(e) => set('audienceList', e.target.value)}
                    placeholder="Audience ID or name"
                    className={inputCls}
                  />
                )}
                <Hint>Target a custom or lookalike audience</Hint>
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
        </>
        )}

        {/* Footer summary */}
        {!showTemplatePicker && (
        <div className="shrink-0 border-t border-ats-border px-5 py-3 flex items-center gap-3 text-[11px] text-ats-text-muted bg-ats-card/50">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PLATFORM_BADGE[form.platform]?.bg} ${PLATFORM_BADGE[form.platform]?.text}`}>
            {PLATFORM_BADGE[form.platform]?.label}
          </span>
          {form.campaignName && <span className="truncate">{form.campaignName}</span>}
          <span className="ml-auto">{fmt$(parseFloat(form.dailyBudget) || 0)}/{form.budgetType === 'daily' ? 'day' : 'total'}</span>
        </div>
        )}
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
  const [nbAudiences2, setNbAudiences2] = useState<NewsBreakAudience[]>([]);
  useEffect(() => { if (platform === 'newsbreak') fetchNewsBreakAudiences().then(setNbAudiences2).catch(() => {}); }, [platform]);
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

  const platformAccounts = accounts
    .filter(a => a.platform === platform && a.status === 'active')
    .sort((a, b) => {
      const aReal = a.platform_account_id && a.has_access_token ? 1 : 0;
      const bReal = b.platform_account_id && b.has_access_token ? 1 : 0;
      return bReal - aReal;
    });
  const objectives = OBJECTIVES[platform] || OBJECTIVES.newsbreak;

  useEffect(() => {
    const accts = accounts
      .filter(a => a.platform === platform && a.status === 'active')
      .sort((a, b) => {
        const aReal = a.platform_account_id && a.has_access_token ? 1 : 0;
        const bReal = b.platform_account_id && b.has_access_token ? 1 : 0;
        return bReal - aReal;
      });
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
                  {platformAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.platform_account_id ? ` (${a.platform_account_id})` : ''}{!a.has_access_token ? ' — no token' : ''}
                    </option>
                  ))}
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
              <Label>Audience</Label>
              {platform === 'newsbreak' && nbAudiences2.length > 0 ? (
                <select value={audienceList} onChange={(e) => setAudienceList(e.target.value)} className={inputCls}>
                  <option value="">No audience (broad targeting)</option>
                  {nbAudiences2.map(a => (
                    <option key={a.audience_id} value={a.audience_id}>
                      {a.audience_name} ({a.audience_type}{a.size ? ` - ${a.size.toLocaleString()}` : ''})
                    </option>
                  ))}
                </select>
              ) : (
                <input value={audienceList} onChange={(e) => setAudienceList(e.target.value)} placeholder="Audience ID or name" className={inputCls} />
              )}
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

// ── Audience Manager Modal ───────────────────────────────────

function AudienceManager({ onClose, accounts }: { onClose: () => void; accounts: Account[] }) {
  const [audiences, setAudiences] = useState<NewsBreakAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'lookalike'>('list');
  // Create custom audience
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [idType, setIdType] = useState<'EMAIL' | 'PHONE' | 'DEVICE_ID'>('EMAIL');
  const [csvText, setCsvText] = useState('');
  const [creating, setCreating] = useState(false);
  // Lookalike
  const [sourceId, setSourceId] = useState('');
  const [lalName, setLalName] = useState('');
  const [lalRatio, setLalRatio] = useState('5');
  const [creatingLal, setCreatingLal] = useState(false);
  // Shared
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const inputCls = "w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent";

  async function loadAudiences() {
    setLoading(true);
    try {
      const data = await fetchNewsBreakAudiences();
      setAudiences(data);
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAudiences(); }, []);

  function parseIds(text: string): string[] {
    return text
      .split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }

  async function handleCreateAndUpload() {
    if (!newName.trim()) { setError('Audience name is required'); return; }
    const ids = parseIds(csvText);
    if (ids.length === 0) { setError('Paste at least one identifier (email, phone, or device ID)'); return; }

    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const { audience_id } = await createNBCustomAudience(newName.trim(), newDesc.trim() || undefined);
      await uploadNBAudienceData(audience_id, idType, ids);
      setSuccess(`Audience "${newName}" created with ${ids.length} identifiers. ID: ${audience_id}`);
      setNewName('');
      setNewDesc('');
      setCsvText('');
      loadAudiences();
    } catch (err: any) {
      setError(err.message || 'Failed to create audience');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateLookalike() {
    if (!sourceId) { setError('Select a source audience'); return; }
    if (!lalName.trim()) { setError('Lookalike audience name is required'); return; }

    setCreatingLal(true);
    setError('');
    setSuccess('');
    try {
      const { audience_id } = await createNBLookalikeAudience(sourceId, lalName.trim(), parseInt(lalRatio) || 5);
      setSuccess(`Lookalike "${lalName}" created. ID: ${audience_id}`);
      setLalName('');
      setSourceId('');
      loadAudiences();
    } catch (err: any) {
      setError(err.message || 'Failed to create lookalike');
    } finally {
      setCreatingLal(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete audience "${name}"?`)) return;
    try {
      await deleteNBAudience(id);
      setAudiences(prev => prev.filter(a => a.audience_id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || '');
    };
    reader.readAsText(file);
  }

  const customAudiences = audiences.filter(a => a.audience_type === 'CUSTOM' || !a.source_audience_id);

  const tabs = [
    { key: 'list' as const, label: 'Audiences', icon: Users },
    { key: 'create' as const, label: 'Custom', icon: Upload },
    { key: 'lookalike' as const, label: 'Lookalike', icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ats-bg border border-ats-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ats-border">
          <div>
            <h2 className="text-base font-bold text-ats-text">NewsBreak Audiences</h2>
            <p className="text-xs text-ats-text-muted mt-0.5">Create custom & lookalike audiences for targeting</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ats-border">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(''); setSuccess(''); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t.key ? 'border-ats-accent text-ats-accent' : 'border-transparent text-ats-text-muted hover:text-ats-text'}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Status messages */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs bg-red-900/40 text-red-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs bg-emerald-900/40 text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {success}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* List tab */}
          {tab === 'list' && (
            <>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-14 bg-ats-card rounded-lg animate-pulse" />)}
                </div>
              ) : audiences.length === 0 ? (
                <div className="text-center py-10 text-sm text-ats-text-muted">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No audiences yet.</p>
                  <p className="text-xs mt-1">Create a custom audience to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {audiences.map(a => (
                    <div key={a.audience_id} className="bg-ats-card border border-ats-border rounded-lg px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ats-text truncate">{a.audience_name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.audience_type === 'LOOKALIKE' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {a.audience_type}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.status === 'READY' || a.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {a.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-ats-text-muted">
                          <span>ID: {a.audience_id}</span>
                          {a.size != null && <span>Size: {a.size.toLocaleString()}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDelete(a.audience_id, a.audience_name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-ats-text-muted hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={loadAudiences} disabled={loading} className="text-xs text-ats-accent hover:underline">
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          )}

          {/* Create Custom Audience tab */}
          {tab === 'create' && (
            <div className="space-y-4">
              <div>
                <Label required>Audience Name</Label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Purchasers Q1 2026" className={inputCls} />
              </div>
              <div>
                <Label>Description</Label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" className={inputCls} />
              </div>
              <div>
                <Label required>Identifier Type</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {(['EMAIL', 'PHONE', 'DEVICE_ID'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setIdType(t)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${idType === t ? 'bg-ats-accent/15 border-ats-accent text-ats-accent' : 'bg-ats-card border-ats-border text-ats-text-muted hover:border-ats-text-muted'}`}
                    >
                      {t === 'EMAIL' ? 'Email' : t === 'PHONE' ? 'Phone' : 'Device ID'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label required>Identifiers</Label>
                <textarea
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  rows={6}
                  placeholder={idType === 'EMAIL' ? 'john@example.com\njane@example.com\n...' : idType === 'PHONE' ? '+15551234567\n+15559876543\n...' : 'device-id-1\ndevice-id-2\n...'}
                  className={inputCls + ' resize-none font-mono text-xs'}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <Hint>{`${parseIds(csvText).length} identifiers detected (one per line, or comma-separated)`}</Hint>
                  <label className="text-[10px] text-ats-accent cursor-pointer hover:underline">
                    Upload CSV
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
              <button
                onClick={handleCreateAndUpload}
                disabled={creating || !newName.trim() || parseIds(csvText).length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {creating ? 'Creating...' : 'Create & Upload Audience'}
              </button>
            </div>
          )}

          {/* Lookalike tab */}
          {tab === 'lookalike' && (
            <div className="space-y-4">
              <div className="bg-ats-card border border-ats-border rounded-lg p-3">
                <p className="text-xs text-ats-text-muted">
                  Create a lookalike audience from an existing custom audience. NewsBreak will find users similar to your source audience — e.g. people who look like your buyers.
                </p>
              </div>
              <div>
                <Label required>Source Audience</Label>
                {customAudiences.length === 0 ? (
                  <p className="text-xs text-ats-text-muted">No custom audiences available. Create one first.</p>
                ) : (
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select a source audience...</option>
                    {customAudiences.map(a => (
                      <option key={a.audience_id} value={a.audience_id}>
                        {a.audience_name} ({a.size?.toLocaleString() || '?'} users)
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <Label required>Lookalike Audience Name</Label>
                <input
                  value={lalName}
                  onChange={e => setLalName(e.target.value)}
                  placeholder="e.g. Purchasers - Lookalike 5%"
                  className={inputCls}
                />
              </div>
              <div>
                <Label>Lookalike Ratio (%)</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1" max="10" step="1"
                    value={lalRatio}
                    onChange={e => setLalRatio(e.target.value)}
                    className="flex-1 accent-ats-accent"
                  />
                  <span className="text-sm font-mono text-ats-text w-8 text-right">{lalRatio}%</span>
                </div>
                <Hint>Lower % = more similar to source. Higher % = larger reach.</Hint>
              </div>
              <button
                onClick={handleCreateLookalike}
                disabled={creatingLal || !sourceId || !lalName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {creatingLal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {creatingLal ? 'Creating...' : 'Create Lookalike Audience'}
              </button>
            </div>
          )}
        </div>
      </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreator, setShowCreator] = useState(false);
  const [showFormatLauncher, setShowFormatLauncher] = useState(false);
  const [showAudienceManager, setShowAudienceManager] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string; currentBudget?: number } | null>(null);
  const [budgetValue, setBudgetValue] = useState('');
  const [budgetTab, setBudgetTab] = useState<'adjust' | 'history'>('adjust');
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [adsetBudgets, setAdsetBudgets] = useState<Record<string, number>>({});
  const [campaignAccountMap, setCampaignAccountMap] = useState<Record<string, number>>({});
  const [assigningCampaign, setAssigningCampaign] = useState<string | null>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Date range
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const toIso = (d: Date) => d.toISOString().split('T')[0];

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    load();
    fetchAccounts().then(setAccounts).catch(() => {});
    fetchCampaignAccountMap().then(maps => {
      const m: Record<string, number> = {};
      for (const row of maps) m[row.campaign_id] = row.account_id;
      setCampaignAccountMap(m);
    }).catch(() => {});
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

  const filteredCampaigns = searchQuery.trim()
    ? campaigns.filter(c => c.campaign_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : campaigns;

  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
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
      const [data, budgets] = await Promise.all([
        fetchLiveAdsets(c.platform, c.campaign_id, startDate, endDate),
        fetchAdGroupBudgets(c.platform, c.campaign_id).catch(() => [] as AdGroupBudget[]),
      ]);
      setExpanded(p => ({ ...p, [key]: data }));
      // Map budgets by adgroup_id
      if (budgets.length > 0) {
        setAdsetBudgets(prev => {
          const next = { ...prev };
          for (const b of budgets) next[b.adgroup_id] = b.budget;
          return next;
        });
      }
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

  async function handleAssignAccount(campaignId: string, accountId: number) {
    try {
      await assignCampaignAccount(campaignId, accountId);
      setCampaignAccountMap(prev => ({ ...prev, [campaignId]: accountId }));
      setAssigningCampaign(null);
      load();
    } catch (err: any) {
      console.error('Failed to assign account:', err);
    }
  }

  async function handleBulkAssign(accountId: number) {
    setBulkAssignOpen(false);
    const ids = [...selectedCampaigns];
    try {
      await bulkAssignCampaignAccount(ids, accountId);
      setCampaignAccountMap(prev => {
        const next = { ...prev };
        for (const cid of ids) next[cid] = accountId;
        return next;
      });
      setSelectedCampaigns(new Set());
      load();
    } catch (err: any) {
      console.error('Bulk assign failed:', err);
    }
  }

  function toggleSelect(campaignId: string) {
    setSelectedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId); else next.add(campaignId);
      return next;
    });
  }

  function toggleSelectAll() {
    const nbCampaigns = sortedCampaigns.filter(c => c.platform === 'newsbreak');
    if (selectedCampaigns.size === nbCampaigns.length) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(nbCampaigns.map(c => c.campaign_id)));
    }
  }

  function requestStatusChange(platform: string, entityType: string, entityId: string, enable: boolean, entityName?: string) {
    const action = enable ? 'Enable' : 'Pause';
    const label = entityName ? `"${entityName}"` : `this ${entityType}`;
    setConfirmModal({
      title: `${action} ${entityType}?`,
      description: `${action} ${label}. This will update the platform and sync fresh data.`,
      onConfirm: () => executeStatus(platform, entityType, entityId, enable),
    });
  }

  async function executeStatus(platform: string, entityType: string, entityId: string, enable: boolean) {
    const key = `status:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await updateLiveEntityStatus(platform, entityType, entityId, enable ? 'ENABLE' : 'DISABLE');
      // Sync platform data so UI reflects actual state
      triggerPlatformSync(platform).catch(() => {});
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
      await updateLiveEntityBudget(budgetModal.platform, budgetModal.entityId, val, budgetModal.currentBudget);
      // Update local budget state immediately
      setAdsetBudgets(prev => ({ ...prev, [budgetModal.entityId]: val }));
      // Sync platform data so UI reflects actual state
      triggerPlatformSync(budgetModal.platform).catch(() => {});
      setBudgetModal(null); setBudgetValue(''); setBudgetTab('adjust');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed');
    } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  }

  async function loadActivityLog(entityId: string) {
    setActivityLogLoading(true);
    try {
      const log = await fetchActivityLog(entityId);
      setActivityLog(log);
    } catch {
      setActivityLog([]);
    } finally {
      setActivityLogLoading(false);
    }
  }

  async function handleDuplicate(platformName: string, entityType: string, entityId: number | string, targetParentId?: string) {
    const key = `dup:${entityType}:${entityId}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      await duplicateLiveEntity(entityType, entityId, targetParentId, platformName);
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

  const totals = filteredCampaigns.reduce(
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
            onClick={() => setShowAudienceManager(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-ats-card border border-ats-border text-ats-text-muted rounded-lg text-sm font-semibold hover:bg-ats-hover transition-colors"
            title="Audience Manager"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Audiences</span>
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
            <span className="hidden sm:inline">New Campaign</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Campaigns" value={String(filteredCampaigns.length)} />
        <Stat label={dateRange.isToday ? "Today's Spend" : 'Total Spend'} value={fmt$(totals.spend)} />
        <Stat label="Conversions" value={fmtNum(totals.conv)} />
        <Stat label="Revenue" value={fmt$(totals.rev)} cls="text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Platform pills — only show platforms with connected accounts */}
        {['all', ...Array.from(new Set(
          accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token).map(a => a.platform)
        ))].map(p => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              platformFilter === p
                ? 'bg-ats-accent/20 border-ats-accent text-ats-accent'
                : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
            }`}
          >
            {PLATFORM_BADGE[p]?.label || p}
          </button>
        ))}

        {/* Account selector — only show connected accounts */}
        {(() => {
          const accts = platformFilter === 'all'
            ? accounts.filter(a => a.status === 'active' && a.platform_account_id && a.has_access_token)
            : accounts.filter(a => a.platform === platformFilter && a.status === 'active' && a.platform_account_id && a.has_access_token);
          if (accts.length === 0) return null;
          return (
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-ats-card border-ats-border text-ats-text hover:bg-ats-hover transition-colors focus:outline-none focus:border-ats-accent ml-1"
            >
              <option value="all">All Accounts</option>
              {accts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.platform_account_id ? ` (${a.platform_account_id})` : ''}{platformFilter === 'all' ? ` — ${PLATFORM_BADGE[a.platform]?.label || a.platform}` : ''}
                </option>
              ))}
            </select>
          );
        })()}

        {/* Campaign search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ats-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="pl-8 pr-3 py-1.5 w-48 rounded-lg text-xs border bg-ats-card border-ats-border text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent transition-colors"
          />
        </div>

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
        <>
        {/* Bulk assign bar */}
        {selectedCampaigns.size > 0 && (
          <div className="bg-ats-accent/10 border border-ats-accent/30 rounded-xl px-4 py-3 mb-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-ats-text font-medium">{selectedCampaigns.size} selected</span>
            <div className="relative">
              <button onClick={() => setBulkAssignOpen(p => !p)} className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:opacity-90">
                Move to Account
              </button>
              {bulkAssignOpen && (
                <div className="absolute left-0 top-9 z-50 bg-ats-card border border-ats-border rounded-lg shadow-xl py-1 min-w-[200px]">
                  {accounts.filter(a => a.platform === 'newsbreak' && a.status === 'active').map(a => (
                    <button key={a.id} onClick={() => handleBulkAssign(a.id)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-ats-hover text-ats-text">
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setSelectedCampaigns(new Set())} className="text-xs text-ats-text-muted hover:text-ats-text">Clear</button>
          </div>
        )}
        <div className="bg-ats-card border border-ats-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <TH className="w-8">
                  {sortedCampaigns.some(c => c.platform === 'newsbreak') && (
                    <input type="checkbox"
                      checked={selectedCampaigns.size > 0 && selectedCampaigns.size === sortedCampaigns.filter(c => c.platform === 'newsbreak').length}
                      onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded border-ats-border accent-ats-accent cursor-pointer" />
                  )}
                </TH>
                <SortTH label="Campaign" sortKey="campaign_name" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <TH align="left">Platform</TH>
                <SortTH label="Spend" sortKey="spend" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="Clicks" sortKey="clicks" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="Impr." sortKey="impressions" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="Conv." sortKey="conversions" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="Revenue" sortKey="conversion_value" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTH label="ROAS" sortKey="roas" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
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
                        <div className="flex items-center gap-1.5">
                          {c.platform === 'newsbreak' && (
                            <input type="checkbox" checked={selectedCampaigns.has(c.campaign_id)} onChange={() => toggleSelect(c.campaign_id)} onClick={e => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded border-ats-border accent-ats-accent cursor-pointer" />
                          )}
                          {isLoading ? <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" /> :
                            isExpanded ? <ChevronDown className="w-4 h-4 text-ats-text-muted" /> : <ChevronRight className="w-4 h-4 text-ats-text-muted" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ats-text">{c.campaign_name || c.campaign_id}</div>
                        <div className="text-[11px] text-ats-text-muted flex items-center gap-1 flex-wrap">
                          {c.platform === 'newsbreak' ? (
                            <span className="relative" onClick={e => { e.stopPropagation(); setAssigningCampaign(prev => prev === c.campaign_id ? null : c.campaign_id); }}>
                              <span className="underline decoration-dotted cursor-pointer hover:text-ats-text">{c.account_name}</span>
                              {assigningCampaign === c.campaign_id && (
                                <div className="absolute left-0 top-5 z-50 bg-ats-card border border-ats-border rounded-lg shadow-xl py-1 min-w-[180px]">
                                  {accounts.filter(a => a.platform === 'newsbreak' && a.status === 'active').map(a => (
                                    <button key={a.id} onClick={e => { e.stopPropagation(); handleAssignAccount(c.campaign_id, a.id); }}
                                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-ats-hover ${campaignAccountMap[c.campaign_id] === a.id ? 'text-ats-accent font-semibold' : 'text-ats-text'}`}>
                                      {a.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </span>
                          ) : (
                            <span>{c.account_name}</span>
                          )}
                          <span>&middot; {c.adset_count} adsets &middot; {c.ad_count} ads</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PLATFORM_BADGE[c.platform]?.bg} ${PLATFORM_BADGE[c.platform]?.text}`}>
                          {PLATFORM_BADGE[c.platform]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ats-text">{fmt$(c.spend)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted">{fmtNum(c.clicks)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted">{fmtNum(c.impressions)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted">{fmtNum(c.conversions)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt$(c.conversion_value)}</td>
                      <td className="px-4 py-3 text-right text-ats-text-muted">{fmtRoas(c.roas)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {actionLoading[`status:campaign:${c.campaign_id}`] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" />
                          ) : (
                            <button onClick={() => requestStatusChange(c.platform, 'campaign', c.campaign_id, false, c.campaign_name)} className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors" title="Pause">
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicate(c.platform, 'campaign', c.campaign_id)}
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
                      const currentBudget = adsetBudgets[as.adset_id];

                      return (
                        <Fragment key={`as-${asKey}`}>
                          <tr className="border-b border-ats-border/30 bg-ats-bg/50 hover:bg-ats-hover/30 cursor-pointer" onClick={() => toggleAdset(c.platform, as.adset_id)}>
                            <td className="px-4 py-2.5 pl-10">
                              {ads === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted" /> :
                                adsOpen ? <ChevronDown className="w-3.5 h-3.5 text-ats-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-ats-text-muted" />}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-ats-text">{as.adset_name || as.adset_id}</span>
                              <span className="text-[10px] text-ats-text-muted ml-2">{as.ad_count} ads</span>
                              {currentBudget !== undefined && (
                                <span className="text-[10px] text-emerald-400/70 ml-2 font-mono">{fmt$(currentBudget)}/day</span>
                              )}
                            </td>
                            <td />
                            <td className="px-4 py-2.5 text-right font-mono text-ats-text text-xs">{fmt$(as.spend)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs">{fmtNum(as.clicks)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs">{fmtNum(as.impressions)}</td>
                            <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs">{fmtNum(as.conversions)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-400 text-xs">{fmt$(as.conversion_value)}</td>
                            <td />
                            <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {actionLoading[`status:adset:${as.adset_id}`] ? <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" /> : (
                                  <>
                                    <button onClick={() => requestStatusChange(c.platform, 'adset', as.adset_id, false, as.adset_name)} className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400" title="Pause"><Pause className="w-3 h-3" /></button>
                                    <button
                                      onClick={() => { setBudgetModal({ platform: c.platform, entityId: as.adset_id, currentBudget }); setBudgetValue(currentBudget ? String(currentBudget) : ''); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold transition-colors"
                                      title="Adjust Budget"
                                    >
                                      <DollarSign className="w-3 h-3" />
                                      {currentBudget !== undefined ? fmt$(currentBudget) : 'Budget'}
                                    </button>
                                    <button
                                      onClick={() => handleDuplicate(c.platform, 'adset', as.adset_id)}
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
                              <td />
                              <td className="px-4 py-2 text-right font-mono text-ats-text text-[11px]">{fmt$(ad.spend)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px]">{fmtNum(ad.clicks)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px]">{fmtNum(ad.impressions)}</td>
                              <td className="px-4 py-2 text-right text-ats-text-muted text-[11px]">{fmtNum(ad.conversions)}</td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[11px]">{fmt$(ad.conversion_value)}</td>
                              <td />
                              <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-0.5">
                                  {ad.ad_id && (
                                    <>
                                      {actionLoading[`status:ad:${ad.ad_id}`] ? <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" /> : (
                                        <button onClick={() => requestStatusChange(c.platform, 'ad', ad.ad_id!, false, ad.ad_name)} className="p-1 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400" title="Pause Ad">
                                          <Pause className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDuplicate(c.platform, 'ad', ad.ad_id!, as.adset_id)}
                                        disabled={actionLoading[`dup:ad:${ad.ad_id}`]}
                                        className="p-1 rounded-md hover:bg-blue-500/20 text-ats-text-muted hover:text-blue-400"
                                        title="Duplicate"
                                      >
                                        {actionLoading[`dup:ad:${ad.ad_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                                      </button>
                                    </>
                                  )}
                                </div>
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
        </>
      )}

      {/* Budget modal */}
      {budgetModal && (() => {
        const currentBudget = budgetModal.currentBudget;
        const newVal = parseFloat(budgetValue) || 0;
        const diff = currentBudget !== undefined ? newVal - currentBudget : 0;
        const diffPct = currentBudget ? ((diff / currentBudget) * 100) : 0;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setBudgetModal(null); setBudgetTab('adjust'); }}>
          <div className="bg-ats-card border border-ats-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h3 className="text-base font-bold text-ats-text">Daily Budget</h3>
              <button onClick={() => { setBudgetModal(null); setBudgetTab('adjust'); }} className="p-1 rounded-lg hover:bg-ats-bg text-ats-text-muted hover:text-ats-text"><X className="w-4 h-4" /></button>
            </div>

            {/* Current budget display */}
            {currentBudget !== undefined && (
              <div className="mx-6 mb-4 p-3 rounded-xl bg-ats-bg border border-ats-border">
                <p className="text-[11px] text-ats-text-muted uppercase tracking-wider mb-1">Current Budget</p>
                <p className="text-2xl font-bold text-ats-text font-mono">{fmt$(currentBudget)}</p>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex mx-6 mb-4 bg-ats-bg rounded-lg p-0.5 border border-ats-border">
              <button
                onClick={() => setBudgetTab('adjust')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${budgetTab === 'adjust' ? 'bg-ats-card text-ats-text shadow-sm' : 'text-ats-text-muted hover:text-ats-text'}`}
              >
                <DollarSign className="w-3 h-3" />Adjust
              </button>
              <button
                onClick={() => { setBudgetTab('history'); loadActivityLog(budgetModal.entityId); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${budgetTab === 'history' ? 'bg-ats-card text-ats-text shadow-sm' : 'text-ats-text-muted hover:text-ats-text'}`}
              >
                <History className="w-3 h-3" />History
              </button>
            </div>

            {/* Adjust tab */}
            {budgetTab === 'adjust' && (
              <div className="px-6 pb-5">
                {/* New budget input */}
                <label className="text-[11px] text-ats-text-muted uppercase tracking-wider mb-1.5 block">New Budget</label>
                <div className="relative mb-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                  <input type="number" min="5" step="1" value={budgetValue} onChange={e => setBudgetValue(e.target.value)} placeholder="50" autoFocus
                    className="w-full pl-7 pr-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent" />
                </div>

                {/* Change preview */}
                {currentBudget !== undefined && newVal > 0 && newVal !== currentBudget && (
                  <div className={`mb-3 p-2.5 rounded-lg border text-xs ${diff < 0 ? 'border-red-500/20 bg-red-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
                    <div className="flex items-center gap-1.5">
                      {diff < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-400" /> : <TrendingUp className="w-3.5 h-3.5 text-green-400" />}
                      <span className={diff < 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                        {diff > 0 ? '+' : ''}{fmt$(diff)} ({diff > 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                      </span>
                      <span className="text-ats-text-muted ml-auto">{fmt$(currentBudget)} → {fmt$(newVal)}</span>
                    </div>
                  </div>
                )}

                {/* Quick adjust - decrease buttons */}
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[-50, -25, -10, -5].map(amt => (
                    <button key={amt} onClick={() => {
                      const cur = parseFloat(budgetValue) || 0;
                      const next = Math.max(5, cur + amt);
                      setBudgetValue(String(Math.round(next * 100) / 100));
                    }}
                      className="py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10">
                      {amt}
                    </button>
                  ))}
                </div>
                {/* Quick adjust - increase buttons */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[5, 10, 25, 50].map(amt => (
                    <button key={amt} onClick={() => {
                      const cur = parseFloat(budgetValue) || 0;
                      const next = Math.max(5, cur + amt);
                      setBudgetValue(String(Math.round(next * 100) / 100));
                    }}
                      className="py-1.5 rounded-lg text-xs font-semibold border border-green-500/30 text-green-400 hover:bg-green-500/10">
                      +{amt}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-ats-text-muted mb-4">Minimum $5.00</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setBudgetModal(null); setBudgetTab('adjust'); }} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text">Cancel</button>
                  <button onClick={handleBudgetSubmit} disabled={actionLoading[`budget:${budgetModal.entityId}`]}
                    className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {actionLoading[`budget:${budgetModal.entityId}`] ? 'Saving...' : 'Update Budget'}
                  </button>
                </div>
              </div>
            )}

            {/* History tab */}
            {budgetTab === 'history' && (
              <div className="px-6 pb-5">
                {activityLogLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-ats-text-muted" />
                  </div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-8 h-8 text-ats-text-muted/40 mx-auto mb-2" />
                    <p className="text-sm text-ats-text-muted">No activity yet</p>
                    <p className="text-[11px] text-ats-text-muted/60 mt-1">Budget changes and pause/resume events will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-0 max-h-80 overflow-y-auto">
                    {activityLog.map((entry, i) => {
                      const date = new Date(entry.created_at);
                      const isPause = entry.action === 'pause';
                      const isResume = entry.action === 'resume';
                      const isBudget = entry.action === 'budget_change';

                      if (isPause || isResume) {
                        return (
                          <div key={entry.id} className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-ats-border/50' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isPause ? 'bg-yellow-500/10' : 'bg-emerald-500/10'}`}>
                              {isPause ? <Pause className="w-3 h-3 text-yellow-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-semibold ${isPause ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                {isPause ? 'Paused' : 'Resumed'}
                              </span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[11px] text-ats-text-muted">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                              <p className="text-[10px] text-ats-text-muted/60">{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        );
                      }

                      // Budget change
                      const change = entry.old_budget != null && entry.new_budget != null ? entry.new_budget - entry.old_budget : null;
                      const changePct = entry.old_budget ? ((change! / entry.old_budget) * 100) : null;
                      const isDecrease = change != null && change < 0;
                      const isIncrease = change != null && change > 0;
                      return (
                        <div key={entry.id} className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-ats-border/50' : ''}`}>
                          <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isDecrease ? 'bg-red-500/10' : isIncrease ? 'bg-green-500/10' : 'bg-ats-bg'}`}>
                            {isDecrease ? <ArrowDown className="w-3 h-3 text-red-400" /> : isIncrease ? <ArrowUp className="w-3 h-3 text-green-400" /> : <DollarSign className="w-3 h-3 text-ats-text-muted" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-ats-text font-mono">{entry.new_budget != null ? fmt$(entry.new_budget) : '—'}</span>
                              {change != null && (
                                <span className={`text-[11px] font-semibold ${isDecrease ? 'text-red-400' : 'text-green-400'}`}>
                                  {change > 0 ? '+' : ''}{fmt$(change)}{changePct != null ? ` (${change > 0 ? '+' : ''}${changePct.toFixed(1)}%)` : ''}
                                </span>
                              )}
                            </div>
                            {entry.old_budget != null && (
                              <p className="text-[11px] text-ats-text-muted">from {fmt$(entry.old_budget)}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[11px] text-ats-text-muted">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                            <p className="text-[10px] text-ats-text-muted/60">{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { if (!confirmLoading) setConfirmModal(null); }}>
          <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-yellow-500/15">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              </div>
              <h3 className="text-base font-bold text-ats-text">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-ats-text-muted mb-5">{confirmModal.description}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={confirmLoading}
                className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmLoading(true);
                  try {
                    await confirmModal.onConfirm();
                  } finally {
                    setConfirmLoading(false);
                    setConfirmModal(null);
                  }
                }}
                disabled={confirmLoading}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {confirmLoading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...</span>
                ) : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign creator */}
      {showCreator && <CampaignCreator onClose={() => setShowCreator(false)} onSuccess={load} accounts={accounts} />}

      {/* Format launcher */}
      {showFormatLauncher && <FormatLauncher onClose={() => setShowFormatLauncher(false)} onSuccess={load} accounts={accounts} />}

      {/* Audience manager */}
      {showAudienceManager && <AudienceManager onClose={() => setShowAudienceManager(false)} accounts={accounts} />}
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
