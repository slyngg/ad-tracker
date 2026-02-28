import { useState, useEffect } from 'react';
import {
  Layers,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import {
  batchCreateCampaign,
  uploadCampaignMedia,
  fetchNewsBreakAudiences,
} from '../../../lib/api';
import type { Account, NewsBreakAudience } from '../types';
import { OBJECTIVES, CTA_OPTIONS, EVENTS, NB_PLACEMENTS, FORMAT_PRESETS, PLATFORM_BADGE } from '../constants';
import { fmt$ } from '../formatters';

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

// ── FormatLauncher ──────────────────────────────────────────

export default function FormatLauncher({ onClose, onSuccess, accounts }: {
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
