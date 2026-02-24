import { useState, useEffect, useCallback } from 'react';
import {
  fetchRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  fetchRuleLogs,
  Rule,
  RuleLog,
} from '../../lib/api';
import PageShell from '../../components/shared/PageShell';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

// ── Constants ──────────────────────────────────────────────────

const METRICS = [
  { value: 'spend', label: 'Spend ($)', format: '$' },
  { value: 'revenue', label: 'Revenue ($)', format: '$' },
  { value: 'roas', label: 'ROAS', format: 'x' },
  { value: 'cpa', label: 'CPA ($)', format: '$' },
  { value: 'conversions', label: 'Conversions', format: '#' },
  { value: 'clicks', label: 'Clicks', format: '#' },
  { value: 'impressions', label: 'Impressions', format: '#' },
  { value: 'ctr', label: 'CTR (%)', format: '%' },
  { value: 'cvr', label: 'CVR (%)', format: '%' },
  { value: 'aov', label: 'AOV ($)', format: '$' },
  { value: 'profit', label: 'Profit ($)', format: '$' },
  { value: 'profit_margin', label: 'Profit Margin (%)', format: '%' },
];

const OPERATORS = [
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'at least' },
  { value: '<=', label: 'at most' },
  { value: '=', label: 'equals' },
];

const PLATFORMS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'meta', label: 'Meta (Facebook)' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'newsbreak', label: 'NewsBreak' },
];

const ACTION_GROUPS = [
  {
    label: 'Notifications',
    actions: [
      { value: 'notification', label: 'In-App Notification' },
      { value: 'email_notify', label: 'Email Alert' },
      { value: 'slack_notify', label: 'Slack Notification' },
      { value: 'webhook', label: 'Fire Webhook' },
      { value: 'flag_review', label: 'Flag for Review' },
    ],
  },
  {
    label: 'Meta (Facebook) Ads',
    actions: [
      { value: 'pause_adset', label: 'Pause Adset' },
      { value: 'enable_adset', label: 'Enable Adset' },
      { value: 'adjust_budget', label: 'Set Adset Budget' },
      { value: 'increase_budget_pct', label: 'Increase Adset Budget %' },
      { value: 'decrease_budget_pct', label: 'Decrease Adset Budget %' },
      { value: 'pause_campaign', label: 'Pause Campaign' },
      { value: 'enable_campaign', label: 'Enable Campaign' },
    ],
  },
  {
    label: 'TikTok Ads',
    actions: [
      { value: 'pause_tiktok_adgroup', label: 'Pause Ad Group' },
      { value: 'enable_tiktok_adgroup', label: 'Enable Ad Group' },
      { value: 'adjust_tiktok_budget', label: 'Set Ad Group Budget' },
      { value: 'increase_tiktok_budget_pct', label: 'Increase Ad Group Budget %' },
      { value: 'decrease_tiktok_budget_pct', label: 'Decrease Ad Group Budget %' },
      { value: 'pause_tiktok_campaign', label: 'Pause Campaign' },
      { value: 'enable_tiktok_campaign', label: 'Enable Campaign' },
    ],
  },
  {
    label: 'Checkout Champ',
    actions: [
      { value: 'pause_cc_subscription', label: 'Pause Subscription' },
      { value: 'cancel_cc_subscription', label: 'Cancel Subscription' },
    ],
  },
];

const ALL_ACTIONS = ACTION_GROUPS.flatMap((g) => g.actions);

// Which actions need which config fields
const META_ADSET_ACTIONS = ['pause_adset', 'enable_adset', 'adjust_budget', 'increase_budget_pct', 'decrease_budget_pct'];
const META_CAMPAIGN_ACTIONS = ['pause_campaign', 'enable_campaign'];
const TIKTOK_ADGROUP_ACTIONS = ['pause_tiktok_adgroup', 'enable_tiktok_adgroup', 'adjust_tiktok_budget', 'increase_tiktok_budget_pct', 'decrease_tiktok_budget_pct'];
const TIKTOK_CAMPAIGN_ACTIONS = ['pause_tiktok_campaign', 'enable_tiktok_campaign'];
const CC_ACTIONS = ['pause_cc_subscription', 'cancel_cc_subscription'];
const BUDGET_SET_ACTIONS = ['adjust_budget', 'adjust_tiktok_budget'];
const BUDGET_PCT_ACTIONS = ['increase_budget_pct', 'decrease_budget_pct', 'increase_tiktok_budget_pct', 'decrease_tiktok_budget_pct'];
const MESSAGE_ACTIONS = ['notification', 'email_notify', 'flag_review'];
const WEBHOOK_ACTIONS = ['webhook'];

// ── Types ──────────────────────────────────────────────────────

interface Condition {
  metric: string;
  operator: string;
  value: string;
}

interface RuleFormData {
  name: string;
  description: string;
  // Trigger
  trigger_type: 'metric_threshold' | 'compound';
  platform: string;
  campaign_name: string;
  conditions: Condition[];
  compound_logic: 'AND' | 'OR';
  // Action
  action_type: string;
  // Action configs
  message: string;
  webhook_url: string;
  adset_id: string;
  campaign_id: string;
  adgroup_id: string;
  purchase_id: string;
  budget: string;
  percent: string;
  cancel_reason: string;
  cooldown_minutes: string;
}

const EMPTY_CONDITION: Condition = { metric: 'spend', operator: '>', value: '' };

const EMPTY_FORM: RuleFormData = {
  name: '',
  description: '',
  trigger_type: 'metric_threshold',
  platform: 'all',
  campaign_name: '',
  conditions: [{ ...EMPTY_CONDITION }],
  compound_logic: 'AND',
  action_type: 'notification',
  message: '',
  webhook_url: '',
  adset_id: '',
  campaign_id: '',
  adgroup_id: '',
  purchase_id: '',
  budget: '',
  percent: '',
  cancel_reason: '',
  cooldown_minutes: '60',
};

// ── Component ──────────────────────────────────────────────────

export default function RulesEnginePage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<RuleLog[]>([]);
  const [logsRuleId, setLogsRuleId] = useState<number | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const data = await fetchRules();
      setRules(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);
  useLiveRefresh(loadRules);

  // ── Handlers ───────────────────────────────────────────────

  const handleToggle = async (id: number) => {
    try {
      const updated = await toggleRule(id);
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (logsRuleId === id) {
        setLogsRuleId(null);
        setLogs([]);
      }
      setMessage({ type: 'success', text: 'Rule deleted' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (rule: Rule) => {
    const tc = rule.trigger_config || {};
    const am = rule.action_meta || {};
    const ac = rule.action_config || {};

    // Reconstruct conditions from trigger_config
    let conditions: Condition[];
    if (rule.trigger_type === 'compound' && tc.conditions) {
      conditions = tc.conditions.map((c: any) => ({
        metric: c.metric || 'spend',
        operator: c.operator || '>',
        value: String(c.value ?? ''),
      }));
    } else {
      conditions = [{
        metric: tc.metric || 'spend',
        operator: tc.operator || '>',
        value: String(tc.value ?? ''),
      }];
    }

    setForm({
      name: rule.name,
      description: rule.description || '',
      trigger_type: rule.trigger_type === 'compound' ? 'compound' : 'metric_threshold',
      platform: tc.platform || 'all',
      campaign_name: tc.campaign_name || '',
      conditions,
      compound_logic: tc.logic || 'AND',
      action_type: rule.action_type,
      message: ac.message || '',
      webhook_url: ac.webhook_url || ac.url || '',
      adset_id: am.adset_id || ac.adset_id || '',
      campaign_id: am.campaign_id || ac.campaign_id || '',
      adgroup_id: am.adgroup_id || ac.adgroup_id || '',
      purchase_id: am.purchase_id || ac.purchase_id || '',
      budget: am.budget || ac.budget || '',
      percent: am.percent || ac.percent || '',
      cancel_reason: am.cancel_reason || '',
      cooldown_minutes: String(rule.cooldown_minutes ?? '60'),
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Rule name is required' });
      return;
    }
    if (form.conditions.some((c) => !c.value.trim())) {
      setMessage({ type: 'error', text: 'All conditions must have a threshold value' });
      return;
    }

    setSaving(true);
    setMessage(null);

    // Build trigger_config
    let trigger_type = form.trigger_type;
    let trigger_config: any = {};

    const baseConfig: any = {};
    if (form.platform !== 'all') baseConfig.platform = form.platform;
    if (form.campaign_name.trim()) baseConfig.campaign_name = form.campaign_name.trim();

    if (form.conditions.length === 1 && trigger_type === 'metric_threshold') {
      trigger_config = {
        ...baseConfig,
        metric: form.conditions[0].metric,
        operator: form.conditions[0].operator,
        value: parseFloat(form.conditions[0].value),
      };
    } else {
      trigger_type = 'compound';
      trigger_config = {
        ...baseConfig,
        logic: form.compound_logic,
        conditions: form.conditions.map((c) => ({
          metric: c.metric,
          operator: c.operator,
          value: parseFloat(c.value),
        })),
      };
    }

    // Build action_config and action_meta
    let action_config: any = {};
    let action_meta: any = {};

    if (MESSAGE_ACTIONS.includes(form.action_type)) {
      action_config = { message: form.message || `${form.name} triggered` };
    } else if (WEBHOOK_ACTIONS.includes(form.action_type)) {
      action_config = { webhook_url: form.webhook_url };
    }

    if (META_ADSET_ACTIONS.includes(form.action_type)) {
      action_meta.adset_id = form.adset_id;
    }
    if (META_CAMPAIGN_ACTIONS.includes(form.action_type)) {
      action_meta.campaign_id = form.campaign_id;
    }
    if (TIKTOK_ADGROUP_ACTIONS.includes(form.action_type)) {
      action_meta.adgroup_id = form.adgroup_id;
    }
    if (TIKTOK_CAMPAIGN_ACTIONS.includes(form.action_type)) {
      action_meta.campaign_id = form.campaign_id;
    }
    if (CC_ACTIONS.includes(form.action_type)) {
      action_meta.purchase_id = form.purchase_id;
      if (form.action_type === 'cancel_cc_subscription') {
        action_meta.cancel_reason = form.cancel_reason || 'Cancelled by automation rule';
      }
    }
    if (BUDGET_SET_ACTIONS.includes(form.action_type)) {
      action_meta.budget = form.budget;
    }
    if (BUDGET_PCT_ACTIONS.includes(form.action_type)) {
      action_meta.percent = form.percent;
    }

    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      trigger_type,
      trigger_config,
      action_type: form.action_type,
      action_config,
      action_meta,
      cooldown_minutes: parseInt(form.cooldown_minutes) || 0,
    };

    try {
      if (editingId) {
        const updated = await updateRule(editingId, payload);
        setRules((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
        setMessage({ type: 'success', text: 'Rule updated' });
      } else {
        const created = await createRule(payload);
        setRules((prev) => [created, ...prev]);
        setMessage({ type: 'success', text: 'Rule created' });
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const viewLogs = async (ruleId: number) => {
    if (logsRuleId === ruleId) {
      setLogsRuleId(null);
      setLogs([]);
      return;
    }
    setLogsLoading(true);
    setLogsRuleId(ruleId);
    try {
      const data = await fetchRuleLogs(ruleId);
      setLogs(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLogsLoading(false);
    }
  };

  // ── Condition Helpers ──────────────────────────────────────

  const updateCondition = (idx: number, field: keyof Condition, value: string) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    }));
  };

  const addCondition = () => {
    setForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { ...EMPTY_CONDITION }],
    }));
  };

  const removeCondition = (idx: number) => {
    if (form.conditions.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== idx),
    }));
  };

  // ── Formatting ─────────────────────────────────────────────

  const formatCooldown = (minutes: number): string => {
    if (!minutes) return 'None';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const getActionLabel = (actionType: string): string => {
    return ALL_ACTIONS.find((a) => a.value === actionType)?.label || actionType;
  };

  const getActionGroup = (actionType: string): string => {
    for (const group of ACTION_GROUPS) {
      if (group.actions.some((a) => a.value === actionType)) return group.label;
    }
    return '';
  };

  const describeTrigger = (rule: Rule): string => {
    const tc = rule.trigger_config || {};
    const platformLabel = tc.platform && tc.platform !== 'all' ? `[${tc.platform.toUpperCase()}] ` : '';
    const campaignLabel = tc.campaign_name ? ` (campaign: ${tc.campaign_name})` : '';

    if (rule.trigger_type === 'compound' && tc.conditions?.length) {
      const parts = tc.conditions.map((c: any) =>
        `${c.metric?.toUpperCase()} ${c.operator} ${c.value}`
      );
      return `${platformLabel}${parts.join(` ${tc.logic || 'AND'} `)}${campaignLabel}`;
    }

    return `${platformLabel}${tc.metric?.toUpperCase()} ${tc.operator} ${tc.value}${campaignLabel}`;
  };

  // ── Styles ─────────────────────────────────────────────────

  const inputCls =
    'w-full px-3 py-2 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent';
  const selectCls =
    'px-3 py-2 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent';
  const labelCls = 'text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide';
  const sectionCls = 'bg-ats-bg border border-ats-border rounded-lg p-4 mb-4';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <PageShell
      title="Rules Engine"
      subtitle="Automated triggers and actions across all platforms"
      actions={
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          + New Rule
        </button>
      }
    >
      {message && (
        <div
          className={`px-3 py-2 mb-4 rounded-md text-sm ${
            message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 mb-4 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      )}

      {/* ── Rule Builder Form ────────────────────────────────── */}
      {showForm && (
        <div className="bg-ats-surface border border-ats-border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-bold text-ats-text mb-4">
            {editingId ? 'Edit Rule' : 'Create Rule'}
          </h3>

          {/* Name & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Rule Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Scale winning campaign"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this rule does"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── IF: Trigger Conditions ─────────────────────── */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] text-ats-text-muted uppercase tracking-wide font-semibold">
                IF (Trigger Conditions)
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  className={`${selectCls} text-xs`}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campaign filter */}
            <div className="mb-3">
              <label className={labelCls}>Campaign Name Filter (optional - supports * wildcards)</label>
              <input
                value={form.campaign_name}
                onChange={(e) => setForm({ ...form, campaign_name: e.target.value })}
                placeholder="e.g. *brand* or exact-campaign-name"
                className={`${inputCls} max-w-md`}
              />
            </div>

            {/* Conditions */}
            {form.conditions.map((cond, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 mb-2">
                {idx === 0 ? (
                  <span className="text-sm text-ats-accent font-bold w-10">IF</span>
                ) : (
                  <select
                    value={form.compound_logic}
                    onChange={(e) => setForm({ ...form, compound_logic: e.target.value as 'AND' | 'OR' })}
                    className={`${selectCls} w-16 text-xs font-bold text-ats-accent`}
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                )}
                <select
                  value={cond.metric}
                  onChange={(e) => updateCondition(idx, 'metric', e.target.value)}
                  className={selectCls}
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                  className={selectCls}
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  value={cond.value}
                  onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                  placeholder="Value"
                  className={`${selectCls} w-28`}
                />
                {form.conditions.length > 1 && (
                  <button
                    onClick={() => removeCondition(idx)}
                    className="text-xs text-ats-red hover:text-red-400 px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addCondition}
              className="text-xs text-ats-accent hover:text-blue-400 mt-1"
            >
              + Add condition
            </button>
          </div>

          {/* ── THEN: Action ───────────────────────────────── */}
          <div className={sectionCls}>
            <label className="text-[11px] text-ats-text-muted uppercase tracking-wide font-semibold block mb-3">
              THEN (Action)
            </label>

            <select
              value={form.action_type}
              onChange={(e) => setForm({ ...form, action_type: e.target.value })}
              className={`${selectCls} w-full mb-3`}
            >
              {ACTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.actions.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Notification/Flag message */}
            {MESSAGE_ACTIONS.includes(form.action_type) && (
              <div>
                <label className={labelCls}>Message</label>
                <input
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Alert message text"
                  className={inputCls}
                />
              </div>
            )}

            {/* Webhook URL */}
            {WEBHOOK_ACTIONS.includes(form.action_type) && (
              <div>
                <label className={labelCls}>Webhook URL</label>
                <input
                  value={form.webhook_url}
                  onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  placeholder="https://hooks.example.com/..."
                  className={inputCls}
                />
              </div>
            )}

            {/* Meta Adset Config */}
            {META_ADSET_ACTIONS.includes(form.action_type) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className={labelCls}>Meta Adset ID</label>
                  <input
                    value={form.adset_id}
                    onChange={(e) => setForm({ ...form, adset_id: e.target.value })}
                    placeholder="e.g. 23856789012345"
                    className={inputCls}
                  />
                </div>
                {BUDGET_SET_ACTIONS.includes(form.action_type) && (
                  <div>
                    <label className={labelCls}>Daily Budget ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.budget}
                      onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      placeholder="e.g. 50"
                      className={inputCls}
                    />
                  </div>
                )}
                {BUDGET_PCT_ACTIONS.includes(form.action_type) && (
                  <div>
                    <label className={labelCls}>Percentage Change (%)</label>
                    <input
                      type="number"
                      step="1"
                      value={form.percent}
                      onChange={(e) => setForm({ ...form, percent: e.target.value })}
                      placeholder="e.g. 20"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Meta Campaign Config */}
            {META_CAMPAIGN_ACTIONS.includes(form.action_type) && (
              <div className="mt-2">
                <label className={labelCls}>Meta Campaign ID</label>
                <input
                  value={form.campaign_id}
                  onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                  placeholder="e.g. 23856789012345"
                  className={inputCls}
                />
              </div>
            )}

            {/* TikTok Ad Group Config */}
            {TIKTOK_ADGROUP_ACTIONS.includes(form.action_type) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className={labelCls}>TikTok Ad Group ID</label>
                  <input
                    value={form.adgroup_id}
                    onChange={(e) => setForm({ ...form, adgroup_id: e.target.value })}
                    placeholder="e.g. 1789012345678"
                    className={inputCls}
                  />
                </div>
                {BUDGET_SET_ACTIONS.includes(form.action_type) && (
                  <div>
                    <label className={labelCls}>Daily Budget ($) — min $20</label>
                    <input
                      type="number"
                      step="0.01"
                      min="20"
                      value={form.budget}
                      onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      placeholder="e.g. 50"
                      className={inputCls}
                    />
                  </div>
                )}
                {BUDGET_PCT_ACTIONS.includes(form.action_type) && (
                  <div>
                    <label className={labelCls}>Percentage Change (%)</label>
                    <input
                      type="number"
                      step="1"
                      value={form.percent}
                      onChange={(e) => setForm({ ...form, percent: e.target.value })}
                      placeholder="e.g. 20"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            )}

            {/* TikTok Campaign Config */}
            {TIKTOK_CAMPAIGN_ACTIONS.includes(form.action_type) && (
              <div className="mt-2">
                <label className={labelCls}>TikTok Campaign ID</label>
                <input
                  value={form.campaign_id}
                  onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                  placeholder="e.g. 1789012345678"
                  className={inputCls}
                />
              </div>
            )}

            {/* Checkout Champ Config */}
            {CC_ACTIONS.includes(form.action_type) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className={labelCls}>Purchase/Subscription ID</label>
                  <input
                    value={form.purchase_id}
                    onChange={(e) => setForm({ ...form, purchase_id: e.target.value })}
                    placeholder="e.g. 12345"
                    className={inputCls}
                  />
                </div>
                {form.action_type === 'cancel_cc_subscription' && (
                  <div>
                    <label className={labelCls}>Cancel Reason</label>
                    <input
                      value={form.cancel_reason}
                      onChange={(e) => setForm({ ...form, cancel_reason: e.target.value })}
                      placeholder="Reason for cancellation"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Cooldown ───────────────────────────────────── */}
          <div className="mb-4">
            <label className={labelCls}>Cooldown (minutes) — prevents re-firing too quickly</label>
            <input
              type="number"
              value={form.cooldown_minutes}
              onChange={(e) => setForm({ ...form, cooldown_minutes: e.target.value })}
              placeholder="60"
              className={`${inputCls} sm:max-w-[200px]`}
            />
            <p className="text-[10px] text-ats-text-muted/60 mt-1">
              Recommended: 60 min for notifications, 120+ min for budget changes
            </p>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="px-5 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Rules List ───────────────────────────────────────── */}
      {rules.length === 0 ? (
        <div className="bg-ats-card border border-ats-border rounded-lg p-8 text-center">
          <p className="text-sm text-ats-text-muted mb-2">No rules configured yet.</p>
          <p className="text-xs text-ats-text-muted/60 mb-4">
            Create rules to automatically adjust budgets, pause campaigns, or get notified when metrics hit thresholds.
          </p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            Create Your First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const cooldown = rule.cooldown_minutes || 0;
            const lastFired = rule.last_fired_at;
            const actionLabel = getActionLabel(rule.action_type);
            const actionGroup = getActionGroup(rule.action_type);
            const triggerDesc = describeTrigger(rule);

            return (
              <div key={rule.id}>
                <div className="bg-ats-card border border-ats-border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(rule.id)}
                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                          rule.enabled ? 'bg-ats-green' : 'bg-ats-border'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                            rule.enabled ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ats-text truncate">
                          {rule.name}
                        </div>
                        <div className="text-xs text-ats-text-muted mt-0.5">
                          IF {triggerDesc}
                        </div>
                        <div className="text-xs text-ats-accent mt-0.5">
                          THEN {actionLabel}
                          {actionGroup && (
                            <span className="text-ats-text-muted/50 ml-1">({actionGroup})</span>
                          )}
                        </div>
                        {rule.description && (
                          <div className="text-xs text-ats-text-muted/70 mt-0.5">{rule.description}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-ats-text-muted/60">
                          {cooldown > 0 && (
                            <span>Cooldown: {formatCooldown(cooldown)}</span>
                          )}
                          {lastFired && (
                            <span>Last fired: {new Date(lastFired).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <button
                        onClick={() => viewLogs(rule.id)}
                        className="px-3 py-2.5 min-h-[44px] text-xs bg-ats-bg border border-ats-border rounded text-ats-text-muted hover:text-ats-text transition-colors"
                      >
                        {logsRuleId === rule.id ? 'Hide Logs' : 'Logs'}
                      </button>
                      <button
                        onClick={() => openEdit(rule)}
                        className="px-3 py-2.5 min-h-[44px] text-xs bg-ats-bg border border-ats-border rounded text-ats-text-muted hover:text-ats-text transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="px-3 py-2.5 min-h-[44px] text-xs text-ats-red hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Execution Logs */}
                {logsRuleId === rule.id && (
                  <div className="mt-1 bg-ats-bg border border-ats-border rounded-lg p-3 sm:p-4 sm:ml-4">
                    <h4 className="text-xs font-semibold text-ats-text-muted uppercase tracking-wide mb-3">
                      Execution Log
                    </h4>
                    {logsLoading ? (
                      <p className="text-xs text-ats-text-muted">Loading logs...</p>
                    ) : logs.length === 0 ? (
                      <p className="text-xs text-ats-text-muted">No executions yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-ats-text-muted border-b border-ats-border">
                              <th className="text-left py-1.5 pr-4 font-medium">Time</th>
                              <th className="text-left py-1.5 pr-4 font-medium">Status</th>
                              <th className="text-left py-1.5 pr-4 font-medium">Trigger Data</th>
                              <th className="text-left py-1.5 font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((log) => (
                              <tr key={log.id} className="border-b border-ats-border/50">
                                <td className="py-1.5 pr-4 text-ats-text-muted font-mono whitespace-nowrap">
                                  {new Date(log.triggered_at).toLocaleString()}
                                </td>
                                <td className="py-1.5 pr-4">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      log.status === 'success'
                                        ? 'bg-emerald-900/50 text-emerald-300'
                                        : 'bg-red-900/50 text-red-300'
                                    }`}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-4 text-ats-text font-mono max-w-[300px] truncate">
                                  {formatTriggerData(log.trigger_data)}
                                </td>
                                <td className="py-1.5 text-ats-text font-mono max-w-[300px] truncate">
                                  {log.error_message || formatActionResult(log.action_result)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ── Log formatting helpers ──────────────────────────────────────

function formatTriggerData(data: any): string {
  if (!data) return '-';
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return data; }
  }
  const parts: string[] = [];
  if (data.spend !== undefined) parts.push(`Spend: $${Number(data.spend).toFixed(2)}`);
  if (data.revenue !== undefined) parts.push(`Rev: $${Number(data.revenue).toFixed(2)}`);
  if (data.roas !== undefined) parts.push(`ROAS: ${Number(data.roas).toFixed(2)}x`);
  if (data.cpa !== undefined) parts.push(`CPA: $${Number(data.cpa).toFixed(2)}`);
  if (parts.length > 0) return parts.join(' | ');
  return JSON.stringify(data);
}

function formatActionResult(result: any): string {
  if (!result) return '-';
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return result; }
  }
  if (result.action) return result.action;
  if (result.type) return `${result.type}${result.delivered ? ' (delivered)' : ''}`;
  return JSON.stringify(result);
}
