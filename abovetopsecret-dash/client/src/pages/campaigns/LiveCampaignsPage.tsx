import { useState, useEffect, Fragment } from 'react';
import {
  fetchLiveCampaigns,
  fetchLiveAdsets,
  fetchLiveAds,
  updateLiveEntityStatus,
  updateLiveEntityBudget,
  quickCreateCampaign,
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
  CalendarDays,
} from 'lucide-react';
import PageShell from '../../components/shared/PageShell';

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

function fmt$(v: number) {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number) { return v.toLocaleString(); }
function fmtRoas(v: number) { return v.toFixed(2) + 'x'; }

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
  // Ad creative
  adName: string;
  headline: string;
  adText: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  landingUrl: string;
  cta: string;
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
  adName: '',
  headline: '',
  adText: '',
  mediaType: 'image',
  mediaUrl: '',
  landingUrl: '',
  cta: 'LEARN_MORE',
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
  const [step, setStep] = useState(0); // 0 = campaign, 1 = ad set, 2 = creative

  const platformAccounts = accounts.filter(a => a.platform === form.platform && a.status === 'active');
  const objectives = OBJECTIVES[form.platform] || OBJECTIVES.newsbreak;

  // Auto-select first account when platform changes
  useEffect(() => {
    const accts = accounts.filter(a => a.platform === form.platform && a.status === 'active');
    setForm(f => ({
      ...f,
      accountId: accts[0]?.id,
      objective: (OBJECTIVES[f.platform] || OBJECTIVES.newsbreak)[0]?.value || 'TRAFFIC',
    }));
  }, [form.platform, accounts]);

  function set(key: keyof CreatorState, value: string | number | undefined) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
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

  async function handlePublish() {
    if (!form.campaignName.trim()) { alert('Campaign name is required'); return; }
    if (!form.adText.trim()) { alert('Ad text is required'); return; }
    if (parseFloat(form.dailyBudget) < 5) { alert('Minimum budget is $5.00'); return; }

    setPublishing(true);
    setResult(null);
    try {
      const res = await quickCreateCampaign({
        account_id: form.accountId,
        platform: form.platform,
        campaign_name: form.campaignName.trim(),
        objective: form.objective,
        daily_budget: parseFloat(form.dailyBudget) || 10,
        adset_name: form.adsetName.trim() || undefined,
        ad_name: form.adName.trim() || undefined,
        headline: form.headline.trim() || undefined,
        ad_text: form.adText.trim(),
        image_url: form.mediaType === 'image' && form.mediaUrl.trim() ? form.mediaUrl.trim() : undefined,
        video_url: form.mediaType === 'video' && form.mediaUrl.trim() ? form.mediaUrl.trim() : undefined,
        landing_page_url: form.landingUrl.trim() || undefined,
        call_to_action: form.cta,
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

  const canPublish = form.campaignName.trim() && form.adText.trim() && parseFloat(form.dailyBudget) >= 5;

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
              {/* Platform */}
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

              {/* Account */}
              {platformAccounts.length > 0 && (
                <div>
                  <Label>Ad Account</Label>
                  <select
                    value={form.accountId}
                    onChange={(e) => set('accountId', parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                  >
                    {platformAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.platform_account_id})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Campaign name */}
              <div>
                <Label required>Campaign Name</Label>
                <input
                  value={form.campaignName}
                  onChange={(e) => set('campaignName', e.target.value)}
                  placeholder="e.g. Spring Sale 2026"
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                />
              </div>

              {/* Objective */}
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
                Next: Ad Set Settings →
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
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                />
                <Hint>Leave blank to auto-generate from campaign name</Hint>
              </div>

              {/* Budget */}
              <div>
                <Label required>Daily Budget</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                  <input
                    type="number"
                    min="5"
                    step="1"
                    value={form.dailyBudget}
                    onChange={(e) => set('dailyBudget', e.target.value)}
                    className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent pl-7"
                  />
                </div>
                <Hint>Minimum $5.00 per day</Hint>
              </div>

              {/* Schedule */}
              <div>
                <Label>Schedule</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div>
                    <span className="text-[10px] text-ats-text-muted block mb-1">Start (optional)</span>
                    <input
                      type="datetime-local"
                      value={form.scheduleStart}
                      onChange={(e) => set('scheduleStart', e.target.value)}
                      className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-ats-text-muted block mb-1">End (optional)</span>
                    <input
                      type="datetime-local"
                      value={form.scheduleEnd}
                      onChange={(e) => set('scheduleEnd', e.target.value)}
                      className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent text-xs"
                    />
                  </div>
                </div>
                <Hint>Leave blank to start immediately with no end date</Hint>
              </div>

              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover transition-colors">
                  ← Back
                </button>
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm font-semibold text-ats-text hover:bg-ats-hover transition-colors">
                  Next: Creative →
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
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                />
              </div>

              {/* Media (Image or Video) */}
              <div>
                <Label>Media</Label>
                {/* Type toggle */}
                <div className="flex gap-2 mt-1.5 mb-2">
                  {(['image', 'video'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { set('mediaType', t); set('mediaUrl', ''); setMediaPreview(null); }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        form.mediaType === t
                          ? 'bg-ats-accent/15 border-ats-accent text-ats-accent'
                          : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                      }`}
                    >
                      {t === 'image' ? 'Image' : 'Video'}
                    </button>
                  ))}
                </div>

                {/* Preview */}
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
                        <ImageIcon className="w-6 h-6 text-ats-text-muted" />
                        <span className="text-xs text-ats-text-muted">
                          Upload {form.mediaType === 'video' ? 'video (MP4, MOV)' : 'image (JPG, PNG, GIF)'}
                        </span>
                        <span className="text-[10px] text-ats-text-muted/50">Max 30MB</span>
                      </>
                    )}
                  </label>
                )}
                {!mediaPreview && (
                  <input
                    value={form.mediaUrl}
                    onChange={(e) => set('mediaUrl', e.target.value)}
                    placeholder={`or paste ${form.mediaType} URL`}
                    className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent text-xs mt-2"
                  />
                )}
              </div>

              {/* Headline */}
              <div>
                <Label>Headline</Label>
                <input
                  value={form.headline}
                  onChange={(e) => set('headline', e.target.value)}
                  placeholder="Short, attention-grabbing headline"
                  maxLength={100}
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                />
                <CharCount current={form.headline.length} max={100} />
              </div>

              {/* Ad text */}
              <div>
                <Label required>Ad Text</Label>
                <textarea
                  value={form.adText}
                  onChange={(e) => set('adText', e.target.value)}
                  placeholder="Your primary ad copy — the main message"
                  rows={4}
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent resize-none"
                />
              </div>

              {/* Landing URL */}
              <div>
                <Label>Landing Page URL</Label>
                <input
                  value={form.landingUrl}
                  onChange={(e) => set('landingUrl', e.target.value)}
                  placeholder="https://yoursite.com/offer"
                  className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                />
              </div>

              {/* CTA */}
              <div>
                <Label>Call to Action</Label>
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
                  ←
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
          <span className="ml-auto">{fmt$(parseFloat(form.dailyBudget) || 0)}/day</span>
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
  return <p className="text-[10px] text-ats-text-muted/60 mt-1 text-right">{current}/{max}</p>;
}

// ── Main Page ───────────────────────────────────────────────

export default function LiveCampaignsPage() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showCreator, setShowCreator] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string } | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  useEffect(() => {
    load();
    fetchAccounts().then(setAccounts).catch(() => {});
  }, [platformFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await fetchLiveCampaigns(platformFilter));
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaign(c: LiveCampaign) {
    const key = `${c.platform}:${c.campaign_id}`;
    if (expanded[key] && expanded[key] !== 'loading') {
      setExpanded(p => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setExpanded(p => ({ ...p, [key]: 'loading' }));
    try {
      const data = await fetchLiveAdsets(c.platform, c.campaign_id);
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
      const data = await fetchLiveAds(platform, adsetId);
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

  // Loading skeleton
  if (loading && campaigns.length === 0) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns">
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />)}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Campaign Manager" subtitle="Create, monitor & manage your campaigns">
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
      actions={
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-ats-text-muted hover:bg-ats-hover transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
        <Stat label="Today's Spend" value={fmt$(totals.spend)} />
        <Stat label="Conversions" value={fmtNum(totals.conv)} />
        <Stat label="Revenue" value={fmt$(totals.rev)} cls="text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
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
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Create Campaign
          </button>
        </div>
      ) : (
        /* Campaign table */
        <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <TH className="w-8" />
                <TH align="left">Campaign</TH>
                <TH align="left" hide="md">Platform</TH>
                <TH>Spend</TH>
                <TH hide="sm">Clicks</TH>
                <TH hide="lg">Impr.</TH>
                <TH hide="md">Conv.</TH>
                <TH>Revenue</TH>
                <TH hide="sm">ROAS</TH>
                <TH className="w-20">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const key = `${c.platform}:${c.campaign_id}`;
                const adsets = expanded[key];
                const isExpanded = adsets && adsets !== 'loading';
                const isLoading = adsets === 'loading';

                return (
                  <Fragment key={key}>
                    {/* Campaign row */}
                    <tr className="border-b border-ats-border/50 hover:bg-ats-hover/50 transition-colors cursor-pointer" onClick={() => toggleCampaign(c)}>
                      <td className="px-4 py-3">
                        {isLoading ? <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" /> :
                          isExpanded ? <ChevronDown className="w-4 h-4 text-ats-text-muted" /> : <ChevronRight className="w-4 h-4 text-ats-text-muted" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ats-text">{c.campaign_name || c.campaign_id}</div>
                        <div className="text-[11px] text-ats-text-muted">{c.account_name} · {c.adset_count} adsets · {c.ad_count} ads</div>
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
                        {actionLoading[`status:campaign:${c.campaign_id}`] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted inline-block" />
                        ) : (
                          <button onClick={() => handleStatus(c.platform, 'campaign', c.campaign_id, false)} className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors" title="Pause">
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                                    <button onClick={() => handleStatus(c.platform, 'adset', as.adset_id, false)} className="p-1 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400" title="Pause"><Pause className="w-3 h-3" /></button>
                                    <button onClick={() => { setBudgetModal({ platform: c.platform, entityId: as.adset_id }); setBudgetValue(''); }} className="p-1 rounded-md hover:bg-emerald-500/20 text-ats-text-muted hover:text-emerald-400" title="Budget"><DollarSign className="w-3 h-3" /></button>
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
                              <td className="hidden sm:table-cell" /><td />
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
  return (
    <th className={`text-${align} px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium ${hidden} ${className}`}>
      {children}
    </th>
  );
}
