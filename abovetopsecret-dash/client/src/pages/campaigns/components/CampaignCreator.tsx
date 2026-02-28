import { useState, useEffect, useRef, Fragment } from 'react';
import {
  FileText,
  X,
  Loader2,
  Sparkles,
  Plus,
  AlertTriangle,
  Image as ImageIcon,
  Film,
  CheckCircle2,
  AlertCircle,
  Rocket,
} from 'lucide-react';
import {
  fetchCampaignTemplates,
  fetchNewsBreakAudiences,
  quickCreateCampaign,
  uploadCampaignMedia,
} from '../../../lib/api';
import { PLATFORM_BADGE, OBJECTIVES, CTA_OPTIONS, EVENTS, NB_PLACEMENTS, DYNAMIC_VARS } from '../constants';
import { CreatorState, INITIAL_CREATOR } from '../types';
import type { Account, CampaignTemplate, NewsBreakAudience } from '../types';
import { fmt$ } from '../formatters';

// ── Helpers ──────────────────────────────────────────────────

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

// ── CampaignCreator ──────────────────────────────────────────

export default function CampaignCreator({ onClose, onSuccess, accounts }: {
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
