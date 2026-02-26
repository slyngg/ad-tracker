import { useState, useEffect } from 'react';
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
  Upload,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import PageShell from '../../components/shared/PageShell';

const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  all: { bg: '', text: '', label: 'All Platforms' },
  meta: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Meta' },
  tiktok: { bg: 'bg-pink-500/15', text: 'text-pink-400', label: 'TikTok' },
  newsbreak: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'NewsBreak' },
};

const NB_OBJECTIVES = [
  { value: 'TRAFFIC', label: 'Traffic' },
  { value: 'CONVERSIONS', label: 'Conversions' },
  { value: 'AWARENESS', label: 'Awareness' },
  { value: 'ENGAGEMENT', label: 'Engagement' },
  { value: 'APP_INSTALLS', label: 'App Installs' },
  { value: 'LEAD_GENERATION', label: 'Lead Generation' },
];

const CTA_OPTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
  'CONTACT_US', 'GET_OFFER', 'SUBSCRIBE', 'APPLY_NOW', 'GET_QUOTE',
];

function fmt$(v: number) {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number) {
  return v.toLocaleString();
}
function fmtRoas(v: number) {
  return v.toFixed(2) + 'x';
}

// ── Quick Ad Creator Panel ─────────────────────────────────

function QuickAdCreator({ onClose, onSuccess, accounts }: {
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
}) {
  const nbAccounts = accounts.filter(a => a.platform === 'newsbreak' && a.status === 'active');

  const [platform, setPlatform] = useState('newsbreak');
  const [accountId, setAccountId] = useState<number | undefined>(nbAccounts[0]?.id);
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('TRAFFIC');
  const [dailyBudget, setDailyBudget] = useState('10');
  const [headline, setHeadline] = useState('');
  const [adText, setAdText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadCampaignMedia(file, accountId);
      // The server returns a file_path — construct the URL
      const url = `/api/campaigns/media/${res.id}`;
      setImageUrl(url);
      setImagePreview(URL.createObjectURL(file));
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handlePublish() {
    if (!campaignName.trim()) { alert('Campaign name is required'); return; }
    if (!adText.trim()) { alert('Ad text is required'); return; }

    setPublishing(true);
    setResult(null);
    try {
      const res = await quickCreateCampaign({
        account_id: accountId,
        platform,
        campaign_name: campaignName.trim(),
        objective,
        daily_budget: parseFloat(dailyBudget) || 10,
        headline: headline.trim() || undefined,
        ad_text: adText.trim(),
        image_url: imageUrl.trim() || undefined,
        landing_page_url: landingUrl.trim() || undefined,
        call_to_action: cta,
      });
      setResult({ success: res.success, error: res.error });
      if (res.success) {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Failed to publish' });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md bg-ats-bg border-l border-ats-border h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-ats-bg/95 backdrop-blur-sm border-b border-ats-border px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-ats-text">Quick Ad Creator</h2>
            <p className="text-[11px] text-ats-text-muted mt-0.5">Create &amp; push in one step</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ats-hover text-ats-text-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Platform selector */}
          <div className="flex gap-2">
            {['newsbreak', 'meta', 'tiktok'].map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  platform === p
                    ? `${PLATFORM_BADGE[p].bg} border-current ${PLATFORM_BADGE[p].text}`
                    : 'bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover'
                }`}
              >
                {PLATFORM_BADGE[p].label}
              </button>
            ))}
          </div>

          {/* Account */}
          {nbAccounts.length > 0 && (
            <Field label="Account">
              <select
                value={accountId}
                onChange={(e) => setAccountId(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
              >
                {accounts.filter(a => a.platform === platform && a.status === 'active').map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Campaign name */}
          <Field label="Campaign Name" required>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Spring Sale 2026"
              className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
            />
          </Field>

          {/* Objective + Budget — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Objective">
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
              >
                {NB_OBJECTIVES.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Daily Budget">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                <input
                  type="number"
                  min="5"
                  step="1"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
                />
              </div>
            </Field>
          </div>

          {/* Divider */}
          <div className="border-t border-ats-border/50" />

          {/* Creative section */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ats-text-muted font-semibold mb-3">Creative</div>

            {/* Image upload */}
            <div className="mb-4">
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-ats-border">
                  <img src={imagePreview} alt="Ad creative" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => { setImagePreview(null); setImageUrl(''); }}
                    className="absolute top-2 right-2 p-1 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-ats-border hover:border-ats-accent/50 cursor-pointer transition-colors bg-ats-card/50">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-ats-text-muted animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="w-6 h-6 text-ats-text-muted" />
                      <span className="text-xs text-ats-text-muted">Upload image or drag &amp; drop</span>
                    </>
                  )}
                </label>
              )}
              {!imagePreview && (
                <div className="mt-2">
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="or paste image URL"
                    className="w-full px-3 py-2 bg-ats-card border border-ats-border rounded-lg text-xs text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
                  />
                </div>
              )}
            </div>

            {/* Headline */}
            <Field label="Headline">
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Short attention-grabbing headline"
                maxLength={100}
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
              />
            </Field>

            {/* Ad text */}
            <Field label="Ad Text" required>
              <textarea
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder="Your ad copy — what will people see?"
                rows={3}
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent resize-none"
              />
            </Field>

            {/* Landing URL + CTA */}
            <Field label="Landing Page URL">
              <input
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder="https://yoursite.com/offer"
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text placeholder-ats-text-muted/50 focus:outline-none focus:border-ats-accent"
              />
            </Field>

            <Field label="Call to Action">
              <select
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full px-3 py-2.5 bg-ats-card border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
              >
                {CTA_OPTIONS.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Result feedback */}
          {result && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
              result.success ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{result.success ? 'Campaign published! Refreshing...' : result.error}</span>
            </div>
          )}

          {/* Publish button */}
          <button
            onClick={handlePublish}
            disabled={publishing || !campaignName.trim() || !adText.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-ats-accent text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                Push to {PLATFORM_BADGE[platform]?.label || platform}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-0">
      <label className="block text-xs text-ats-text-muted mb-1.5 font-medium">
        {label}{required && <span className="text-ats-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function LiveCampaignsPage() {
  const [campaigns, setCampaigns] = useState<LiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showCreator, setShowCreator] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Expanded state: campaign_id -> adsets
  const [expanded, setExpanded] = useState<Record<string, LiveAdset[] | 'loading'>>({});
  // Expanded adset -> ads
  const [expandedAds, setExpandedAds] = useState<Record<string, LiveAd[] | 'loading'>>({});

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [budgetModal, setBudgetModal] = useState<{ platform: string; entityId: string; current: number } | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  useEffect(() => {
    load();
    fetchAccounts().then(setAccounts).catch(() => {});
  }, [platformFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLiveCampaigns(platformFilter);
      setCampaigns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load live campaigns');
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaign(c: LiveCampaign) {
    const key = `${c.platform}:${c.campaign_id}`;
    if (expanded[key] && expanded[key] !== 'loading') {
      setExpanded((prev) => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    setExpanded((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const adsets = await fetchLiveAdsets(c.platform, c.campaign_id);
      setExpanded((prev) => ({ ...prev, [key]: adsets }));
    } catch {
      setExpanded((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  async function toggleAdset(platform: string, adsetId: string) {
    const key = `${platform}:${adsetId}`;
    if (expandedAds[key] && expandedAds[key] !== 'loading') {
      setExpandedAds((prev) => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    setExpandedAds((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const ads = await fetchLiveAds(platform, adsetId);
      setExpandedAds((prev) => ({ ...prev, [key]: ads }));
    } catch {
      setExpandedAds((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  async function handleStatusToggle(platform: string, entityType: string, entityId: string, enable: boolean) {
    const key = `status:${entityType}:${entityId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await updateLiveEntityStatus(platform, entityType, entityId, enable ? 'ENABLE' : 'DISABLE');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleBudgetSubmit() {
    if (!budgetModal) return;
    const val = parseFloat(budgetValue);
    if (isNaN(val) || val < 5) { alert('Budget must be at least $5.00'); return; }
    const key = `budget:${budgetModal.entityId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await updateLiveEntityBudget(budgetModal.platform, budgetModal.entityId, val);
      setBudgetModal(null);
      setBudgetValue('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust budget');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  if (loading && campaigns.length === 0) {
    return (
      <PageShell title="Live Campaigns" subtitle="Monitor & manage active campaigns">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-ats-card rounded-xl animate-pulse border border-ats-border" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Live Campaigns" subtitle="Monitor & manage active campaigns">
        <div className="px-4 py-3 rounded-lg text-sm bg-red-900/50 text-red-300">{error}</div>
      </PageShell>
    );
  }

  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      conversions: acc.conversions + c.conversions,
      revenue: acc.revenue + c.conversion_value,
    }),
    { spend: 0, conversions: 0, revenue: 0 }
  );

  return (
    <PageShell
      title="Live Campaigns"
      subtitle="Monitor & manage active campaigns"
      actions={
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Ad
        </button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Campaigns" value={String(campaigns.length)} />
        <SummaryCard label="Total Spend" value={fmt$(totals.spend)} />
        <SummaryCard label="Conversions" value={fmtNum(totals.conversions)} />
        <SummaryCard label="Revenue" value={fmt$(totals.revenue)} valueClass="text-emerald-400" />
      </div>

      {/* Platform filter */}
      <div className="flex items-center gap-2 mb-4">
        {['all', 'meta', 'tiktok', 'newsbreak'].map((p) => (
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
        {loading && <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin ml-2" />}
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="w-12 h-12 text-ats-text-muted mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-ats-text mb-1">No live campaigns</h3>
          <p className="text-sm text-ats-text-muted max-w-sm mb-6">
            No active campaigns found. Create your first ad to get started.
          </p>
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Create Ad
          </button>
        </div>
      ) : (
        <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ats-border">
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium w-8" />
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Campaign</th>
                <th className="text-left px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden md:table-cell">Platform</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Spend</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden sm:table-cell">Clicks</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden lg:table-cell">Impr.</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden md:table-cell">Conv.</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium">Revenue</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium hidden sm:table-cell">ROAS</th>
                <th className="text-right px-4 py-3 text-[11px] text-ats-text-muted uppercase tracking-wide font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const key = `${c.platform}:${c.campaign_id}`;
                const adsets = expanded[key];
                const isExpanded = adsets && adsets !== 'loading';
                const isLoading = adsets === 'loading';

                return (
                  <CampaignBlock
                    key={key}
                    campaign={c}
                    isExpanded={!!isExpanded}
                    isLoading={!!isLoading}
                    adsets={Array.isArray(adsets) ? adsets : []}
                    expandedAds={expandedAds}
                    actionLoading={actionLoading}
                    onToggleCampaign={() => toggleCampaign(c)}
                    onToggleAdset={(adsetId) => toggleAdset(c.platform, adsetId)}
                    onStatusToggle={handleStatusToggle}
                    onBudgetClick={(entityId, current) => {
                      setBudgetModal({ platform: c.platform, entityId, current });
                      setBudgetValue('');
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Budget modal */}
      {budgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setBudgetModal(null)}>
          <div className="bg-ats-card border border-ats-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-ats-text mb-4">Adjust Daily Budget</h3>
            <div className="mb-4">
              <label className="block text-xs text-ats-text-muted mb-1.5">New daily budget (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
                <input
                  type="number"
                  min="5"
                  step="1"
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full pl-7 pr-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent"
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-ats-text-muted mt-1">Minimum $5.00</p>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setBudgetModal(null)} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text transition-colors">
                Cancel
              </button>
              <button
                onClick={handleBudgetSubmit}
                disabled={actionLoading[`budget:${budgetModal.entityId}`]}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {actionLoading[`budget:${budgetModal.entityId}`] ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Ad Creator slide-out */}
      {showCreator && (
        <QuickAdCreator
          onClose={() => setShowCreator(false)}
          onSuccess={load}
          accounts={accounts}
        />
      )}
    </PageShell>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SummaryCard({ label, value, valueClass = 'text-ats-text' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-ats-card border border-ats-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-ats-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function CampaignBlock({
  campaign: c, isExpanded, isLoading, adsets, expandedAds, actionLoading,
  onToggleCampaign, onToggleAdset, onStatusToggle, onBudgetClick,
}: {
  campaign: LiveCampaign;
  isExpanded: boolean;
  isLoading: boolean;
  adsets: LiveAdset[];
  expandedAds: Record<string, LiveAd[] | 'loading'>;
  actionLoading: Record<string, boolean>;
  onToggleCampaign: () => void;
  onToggleAdset: (adsetId: string) => void;
  onStatusToggle: (platform: string, entityType: string, entityId: string, enable: boolean) => void;
  onBudgetClick: (entityId: string, current: number) => void;
}) {
  return (
    <>
      {/* Campaign row */}
      <tr
        className="border-b border-ats-border/50 hover:bg-ats-hover/50 transition-colors cursor-pointer"
        onClick={onToggleCampaign}
      >
        <td className="px-4 py-3">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-ats-text-muted animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="w-4 h-4 text-ats-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-ats-text-muted" />
          )}
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
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          {actionLoading[`status:campaign:${c.campaign_id}`] ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-ats-text-muted inline-block" />
          ) : (
            <button
              onClick={() => onStatusToggle(c.platform, 'campaign', c.campaign_id, false)}
              className="p-1.5 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors"
              title="Pause campaign"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
        </td>
      </tr>

      {/* Adset rows */}
      {isExpanded && adsets.map((as) => {
        const asKey = `${c.platform}:${as.adset_id}`;
        const ads = expandedAds[asKey];
        const adsExpanded = ads && ads !== 'loading';
        const adsLoading = ads === 'loading';

        return (
          <AdsetBlock
            key={`adset-${asKey}`}
            platform={c.platform}
            adset={as}
            ads={Array.isArray(ads) ? ads : []}
            adsExpanded={!!adsExpanded}
            adsLoading={!!adsLoading}
            actionLoading={actionLoading}
            onToggle={() => onToggleAdset(as.adset_id)}
            onStatusToggle={onStatusToggle}
            onBudgetClick={onBudgetClick}
          />
        );
      })}
    </>
  );
}

function AdsetBlock({
  platform, adset: as, ads, adsExpanded, adsLoading, actionLoading,
  onToggle, onStatusToggle, onBudgetClick,
}: {
  platform: string;
  adset: LiveAdset;
  ads: LiveAd[];
  adsExpanded: boolean;
  adsLoading: boolean;
  actionLoading: Record<string, boolean>;
  onToggle: () => void;
  onStatusToggle: (platform: string, entityType: string, entityId: string, enable: boolean) => void;
  onBudgetClick: (entityId: string, current: number) => void;
}) {
  return (
    <>
      <tr
        className="border-b border-ats-border/30 bg-ats-bg/50 hover:bg-ats-hover/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 pl-10">
          {adsLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-ats-text-muted animate-spin" />
          ) : adsExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-ats-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-ats-text-muted" />
          )}
        </td>
        <td className="px-4 py-2.5">
          <div className="text-sm text-ats-text">{as.adset_name || as.adset_id}</div>
          <div className="text-[10px] text-ats-text-muted">{as.ad_count} ads</div>
        </td>
        <td className="hidden md:table-cell" />
        <td className="px-4 py-2.5 text-right font-mono text-ats-text text-xs">{fmt$(as.spend)}</td>
        <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden sm:table-cell">{fmtNum(as.clicks)}</td>
        <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden lg:table-cell">{fmtNum(as.impressions)}</td>
        <td className="px-4 py-2.5 text-right text-ats-text-muted text-xs hidden md:table-cell">{fmtNum(as.conversions)}</td>
        <td className="px-4 py-2.5 text-right font-mono text-emerald-400 text-xs">{fmt$(as.conversion_value)}</td>
        <td className="hidden sm:table-cell" />
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {actionLoading[`status:adset:${as.adset_id}`] ? (
              <Loader2 className="w-3 h-3 animate-spin text-ats-text-muted" />
            ) : (
              <>
                <button
                  onClick={() => onStatusToggle(platform, 'adset', as.adset_id, false)}
                  className="p-1 rounded-md hover:bg-yellow-500/20 text-ats-text-muted hover:text-yellow-400 transition-colors"
                  title="Pause"
                >
                  <Pause className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onBudgetClick(as.adset_id, as.spend)}
                  className="p-1 rounded-md hover:bg-emerald-500/20 text-ats-text-muted hover:text-emerald-400 transition-colors"
                  title="Budget"
                >
                  <DollarSign className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Individual ads */}
      {adsExpanded && ads.map((ad, idx) => (
        <tr key={`ad-${idx}`} className="border-b border-ats-border/20 bg-ats-bg/30">
          <td className="px-4 py-2 pl-16" />
          <td className="px-4 py-2">
            <span className="text-xs text-ats-text-muted">{ad.ad_name || ad.ad_id || 'Unnamed ad'}</span>
          </td>
          <td className="hidden md:table-cell" />
          <td className="px-4 py-2 text-right font-mono text-ats-text text-[11px]">{fmt$(ad.spend)}</td>
          <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden sm:table-cell">{fmtNum(ad.clicks)}</td>
          <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden lg:table-cell">{fmtNum(ad.impressions)}</td>
          <td className="px-4 py-2 text-right text-ats-text-muted text-[11px] hidden md:table-cell">{fmtNum(ad.conversions)}</td>
          <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[11px]">{fmt$(ad.conversion_value)}</td>
          <td className="hidden sm:table-cell" />
          <td />
        </tr>
      ))}
    </>
  );
}
