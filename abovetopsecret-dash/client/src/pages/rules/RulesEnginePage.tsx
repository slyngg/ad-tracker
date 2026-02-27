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
  { value: 'spend', label: 'Spend', format: '$' },
  { value: 'revenue', label: 'Revenue', format: '$' },
  { value: 'roas', label: 'ROAS', format: 'x' },
  { value: 'cpa', label: 'CPA', format: '$' },
  { value: 'conversions', label: 'Conversions', format: '#' },
  { value: 'clicks', label: 'Clicks', format: '#' },
  { value: 'impressions', label: 'Impressions', format: '#' },
  { value: 'ctr', label: 'CTR', format: '%' },
  { value: 'cvr', label: 'CVR', format: '%' },
  { value: 'aov', label: 'AOV', format: '$' },
  { value: 'profit', label: 'Profit', format: '$' },
  { value: 'profit_margin', label: 'Profit Margin', format: '%' },
];

const OPERATORS = [
  { value: '>', label: 'is above' },
  { value: '<', label: 'drops below' },
  { value: '>=', label: 'is at least' },
  { value: '<=', label: 'is at most' },
  { value: '=', label: 'equals' },
];

const PLATFORMS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'meta', label: 'Meta' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'newsbreak', label: 'NewsBreak' },
];

const ACTION_GROUPS = [
  {
    label: 'Notifications',
    actions: [
      { value: 'notification', label: 'Send in-app notification' },
      { value: 'email_notify', label: 'Send email alert' },
      { value: 'slack_notify', label: 'Send Slack notification' },
      { value: 'webhook', label: 'Fire webhook' },
      { value: 'flag_review', label: 'Flag for review' },
    ],
  },
  {
    label: 'Meta (Facebook) Ads',
    actions: [
      { value: 'pause_adset', label: 'Pause adset' },
      { value: 'enable_adset', label: 'Enable adset' },
      { value: 'adjust_budget', label: 'Set adset budget' },
      { value: 'increase_budget_pct', label: 'Increase adset budget by %' },
      { value: 'decrease_budget_pct', label: 'Decrease adset budget by %' },
      { value: 'pause_campaign', label: 'Pause campaign' },
      { value: 'enable_campaign', label: 'Enable campaign' },
    ],
  },
  {
    label: 'TikTok Ads',
    actions: [
      { value: 'pause_tiktok_adgroup', label: 'Pause ad group' },
      { value: 'enable_tiktok_adgroup', label: 'Enable ad group' },
      { value: 'adjust_tiktok_budget', label: 'Set ad group budget' },
      { value: 'increase_tiktok_budget_pct', label: 'Increase ad group budget by %' },
      { value: 'decrease_tiktok_budget_pct', label: 'Decrease ad group budget by %' },
      { value: 'pause_tiktok_campaign', label: 'Pause campaign' },
      { value: 'enable_tiktok_campaign', label: 'Enable campaign' },
    ],
  },
  {
    label: 'Checkout Champ',
    actions: [
      { value: 'pause_cc_subscription', label: 'Pause subscription' },
      { value: 'cancel_cc_subscription', label: 'Cancel subscription' },
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

// ── Templates ────────────────────────────────────────────────

interface RuleTemplate {
  name: string;
  description: string;
  icon: string;
  color: string;
  form: Partial<RuleFormData>;
}

const TEMPLATES: RuleTemplate[] = [
  {
    name: 'Kill Losing Campaign',
    description: 'Pause when ROAS drops below your target',
    icon: '\u{1F6D1}',
    color: 'border-red-500/40 hover:border-red-500/70 hover:bg-red-500/5',
    form: {
      name: 'Kill Losing Campaign',
      description: 'Pauses campaign when ROAS drops too low',
      conditions: [{ metric: 'roas', operator: '<', value: '1.5' }],
      action_type: 'pause_campaign',
      cooldown_minutes: '120',
    },
  },
  {
    name: 'Scale Winner',
    description: 'Boost budget when ROAS is strong',
    icon: '\u{1F680}',
    color: 'border-emerald-500/40 hover:border-emerald-500/70 hover:bg-emerald-500/5',
    form: {
      name: 'Scale Winner',
      description: 'Increase budget when ROAS is high',
      conditions: [{ metric: 'roas', operator: '>', value: '3' }],
      action_type: 'increase_budget_pct',
      percent: '20',
      cooldown_minutes: '240',
    },
  },
  {
    name: 'Spend Alert',
    description: 'Get notified when daily spend exceeds a limit',
    icon: '\u{1F4B8}',
    color: 'border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/5',
    form: {
      name: 'Spend Alert',
      description: 'Alert when spend exceeds limit',
      conditions: [{ metric: 'spend', operator: '>', value: '500' }],
      action_type: 'notification',
      message: 'Daily spend has exceeded $500',
      cooldown_minutes: '60',
    },
  },
  {
    name: 'CPA Guard',
    description: 'Pause when cost per acquisition gets too high',
    icon: '\u{1F6E1}',
    color: 'border-blue-500/40 hover:border-blue-500/70 hover:bg-blue-500/5',
    form: {
      name: 'CPA Guard',
      description: 'Pauses campaign when CPA exceeds target',
      conditions: [{ metric: 'cpa', operator: '>', value: '50' }],
      action_type: 'pause_campaign',
      cooldown_minutes: '120',
    },
  },
  {
    name: 'Low CTR Warning',
    description: 'Flag creative for review when CTR drops',
    icon: '\u{1F50D}',
    color: 'border-purple-500/40 hover:border-purple-500/70 hover:bg-purple-500/5',
    form: {
      name: 'Low CTR Warning',
      description: 'Flag for review when CTR is too low',
      conditions: [{ metric: 'ctr', operator: '<', value: '1' }],
      action_type: 'flag_review',
      message: 'CTR has dropped below 1% — review creative',
      cooldown_minutes: '60',
    },
  },
  {
    name: 'Profit Protector',
    description: 'Pause when campaign goes negative',
    icon: '\u{26A0}',
    color: 'border-orange-500/40 hover:border-orange-500/70 hover:bg-orange-500/5',
    form: {
      name: 'Profit Protector',
      description: 'Pauses campaign when profit goes negative',
      conditions: [{ metric: 'profit', operator: '<', value: '0' }],
      action_type: 'pause_campaign',
      cooldown_minutes: '120',
    },
  },
];

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

// ── Wizard Steps ─────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

const STEP_LABELS: Record<WizardStep, { title: string; subtitle: string }> = {
  1: { title: 'When should this rule fire?', subtitle: 'Set the condition that triggers this rule' },
  2: { title: 'What should happen?', subtitle: 'Choose the action to take when conditions are met' },
  3: { title: 'Name & settings', subtitle: 'Give your rule a name and configure timing' },
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
  const [step, setStep] = useState<WizardStep>(1);

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
    setStep(1);
    setShowForm(true);
  };

  const openFromTemplate = (template: RuleTemplate) => {
    setForm({
      ...EMPTY_FORM,
      ...template.form,
      conditions: template.form.conditions || [{ ...EMPTY_CONDITION }],
    });
    setEditingId(null);
    setStep(1);
    setShowForm(true);
  };

  const openEdit = (rule: Rule) => {
    const tc = rule.trigger_config || {};
    const am = rule.action_meta || {};
    const ac = rule.action_config || {};

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
    setStep(1);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Give your rule a name' });
      setStep(3);
      return;
    }
    if (form.conditions.some((c) => !c.value.trim())) {
      setMessage({ type: 'error', text: 'Fill in a value for each condition' });
      setStep(1);
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

  // ── Natural language preview ──────────────────────────────

  const buildPreview = (): string => {
    const platformLabel = form.platform !== 'all'
      ? PLATFORMS.find((p) => p.value === form.platform)?.label || form.platform
      : '';

    const condParts = form.conditions
      .filter((c) => c.value.trim())
      .map((c) => {
        const metricLabel = METRICS.find((m) => m.value === c.metric)?.label || c.metric;
        const metricFmt = METRICS.find((m) => m.value === c.metric)?.format || '';
        const opLabel = OPERATORS.find((o) => o.value === c.operator)?.label || c.operator;
        let valueStr = c.value;
        if (metricFmt === '$') valueStr = `$${c.value}`;
        else if (metricFmt === '%') valueStr = `${c.value}%`;
        else if (metricFmt === 'x') valueStr = `${c.value}x`;
        return `${metricLabel} ${opLabel} ${valueStr}`;
      });

    const actionLabel = ALL_ACTIONS.find((a) => a.value === form.action_type)?.label || form.action_type;

    const whenPart = condParts.length > 0
      ? condParts.join(form.compound_logic === 'OR' ? ' or ' : ' and ')
      : '...';

    const onPart = platformLabel ? ` on ${platformLabel}` : '';
    const campPart = form.campaign_name.trim() ? ` for "${form.campaign_name}"` : '';

    return `When ${whenPart}${onPart}${campPart}, ${actionLabel.toLowerCase()}`;
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
    const platformLabel = tc.platform && tc.platform !== 'all'
      ? PLATFORMS.find((p) => p.value === tc.platform)?.label || tc.platform
      : '';

    const campaignLabel = tc.campaign_name ? ` for "${tc.campaign_name}"` : '';

    if (rule.trigger_type === 'stoplight') {
      const signalLabels: Record<string, string> = { scale: 'Scale (green)', watch: 'Watch (amber)', cut: 'Cut (red)' };
      const signalLabel = signalLabels[tc.signal] || tc.signal || 'any';
      const plat = tc.platform ? ` on ${PLATFORMS.find((p) => p.value === tc.platform)?.label || tc.platform}` : '';
      return `Stoplight signal = ${signalLabel}${plat}`;
    }

    if (rule.trigger_type === 'compound' && tc.conditions?.length) {
      const parts = tc.conditions.map((c: any) => {
        const metricLabel = METRICS.find((m) => m.value === c.metric)?.label || c.metric;
        const opLabel = OPERATORS.find((o) => o.value === c.operator)?.label || c.operator;
        const fmt = METRICS.find((m) => m.value === c.metric)?.format || '';
        let val = String(c.value);
        if (fmt === '$') val = `$${val}`;
        else if (fmt === '%') val = `${val}%`;
        else if (fmt === 'x') val = `${val}x`;
        return `${metricLabel} ${opLabel} ${val}`;
      });
      const onPart = platformLabel ? ` on ${platformLabel}` : '';
      return `${parts.join(` ${tc.logic?.toLowerCase() || 'and'} `)}${onPart}${campaignLabel}`;
    }

    const metricLabel = METRICS.find((m) => m.value === tc.metric)?.label || tc.metric;
    const opLabel = OPERATORS.find((o) => o.value === tc.operator)?.label || tc.operator;
    const fmt = METRICS.find((m) => m.value === tc.metric)?.format || '';
    let val = String(tc.value ?? '');
    if (fmt === '$') val = `$${val}`;
    else if (fmt === '%') val = `${val}%`;
    else if (fmt === 'x') val = `${val}x`;
    const onPart = platformLabel ? ` on ${platformLabel}` : '';
    return `${metricLabel} ${opLabel} ${val}${onPart}${campaignLabel}`;
  };

  // ── Step validation ───────────────────────────────────────

  const canAdvance = (s: WizardStep): boolean => {
    if (s === 1) return form.conditions.every((c) => c.value.trim() !== '');
    if (s === 2) return !!form.action_type;
    return true;
  };

  // ── Styles ─────────────────────────────────────────────────

  const inputCls =
    'w-full px-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent focus:ring-1 focus:ring-ats-accent/30 transition-colors';
  const selectCls =
    'px-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent focus:ring-1 focus:ring-ats-accent/30 transition-colors';
  const labelCls = 'text-xs text-ats-text-muted block mb-1.5 font-medium';

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
      subtitle="Set it and forget it — automate your campaign management"
      actions={
        !showForm ? (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            + New Rule
          </button>
        ) : undefined
      }
    >
      {message && (
        <div
          className={`px-4 py-3 mb-4 rounded-lg text-sm font-medium ${
            message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' : 'bg-red-900/50 text-red-300 border border-red-500/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 mb-4 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-500/30">{error}</div>
      )}

      {/* ── Wizard Form ────────────────────────────────────────── */}
      {showForm && (
        <div className="mb-6">
          {/* Live preview sentence */}
          <div className="bg-ats-surface border border-ats-accent/30 rounded-lg px-4 py-3 mb-4">
            <div className="text-[10px] text-ats-text-muted uppercase tracking-wider mb-1 font-medium">Rule Preview</div>
            <div className="text-sm text-ats-text font-medium">{buildPreview()}</div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {([1, 2, 3] as WizardStep[]).map((s) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  step === s
                    ? 'bg-ats-accent text-white'
                    : s < step
                      ? 'bg-ats-accent/20 text-ats-accent cursor-pointer hover:bg-ats-accent/30'
                      : 'bg-ats-bg text-ats-text-muted border border-ats-border'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? 'bg-white/20' : s < step ? 'bg-ats-accent/30' : 'bg-ats-border'
                }`}>{s}</span>
                {STEP_LABELS[s].title}
              </button>
            ))}
          </div>

          <div className="bg-ats-surface border border-ats-border rounded-lg p-5">
            {/* Step subtitle */}
            <p className="text-xs text-ats-text-muted mb-4">{STEP_LABELS[step].subtitle}</p>

            {/* ── STEP 1: When (Trigger) ──────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Platform & campaign filter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Platform</label>
                    <select
                      value={form.platform}
                      onChange={(e) => setForm({ ...form, platform: e.target.value })}
                      className={`${selectCls} w-full`}
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Campaign name filter <span className="text-ats-text-muted/50">(optional)</span></label>
                    <input
                      value={form.campaign_name}
                      onChange={(e) => setForm({ ...form, campaign_name: e.target.value })}
                      placeholder='e.g. *brand* or leave empty for all'
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <label className={labelCls}>Conditions</label>
                  <div className="space-y-2">
                    {form.conditions.map((cond, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        {idx > 0 && (
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
                          className={`${selectCls} flex-1 min-w-[120px]`}
                        >
                          {METRICS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <select
                          value={cond.operator}
                          onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                          className={`${selectCls} min-w-[120px]`}
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                        <div className="relative flex-1 min-w-[100px] max-w-[140px]">
                          {METRICS.find((m) => m.value === cond.metric)?.format === '$' && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">$</span>
                          )}
                          <input
                            type="number"
                            step="any"
                            value={cond.value}
                            onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                            placeholder="Value"
                            className={`${selectCls} w-full ${METRICS.find((m) => m.value === cond.metric)?.format === '$' ? 'pl-7' : ''}`}
                          />
                          {METRICS.find((m) => m.value === cond.metric)?.format === '%' && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">%</span>
                          )}
                          {METRICS.find((m) => m.value === cond.metric)?.format === 'x' && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">x</span>
                          )}
                        </div>
                        {form.conditions.length > 1 && (
                          <button
                            onClick={() => removeCondition(idx)}
                            className="p-2 text-ats-text-muted hover:text-red-400 transition-colors"
                            title="Remove condition"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addCondition}
                    className="mt-2 text-xs text-ats-accent hover:text-blue-400 font-medium"
                  >
                    + Add another condition
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Then (Action) ───────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Action groups as cards */}
                <div className="space-y-3">
                  {ACTION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="text-[10px] text-ats-text-muted uppercase tracking-wider font-medium mb-1.5">{group.label}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {group.actions.map((a) => (
                          <button
                            key={a.value}
                            onClick={() => setForm({ ...form, action_type: a.value })}
                            className={`text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                              form.action_type === a.value
                                ? 'border-ats-accent bg-ats-accent/10 text-ats-accent'
                                : 'border-ats-border bg-ats-bg text-ats-text-muted hover:border-ats-text-muted/30 hover:text-ats-text'
                            }`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dynamic action config */}
                <div className="border-t border-ats-border pt-4 space-y-3">
                  {MESSAGE_ACTIONS.includes(form.action_type) && (
                    <div>
                      <label className={labelCls}>Alert message</label>
                      <input
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="e.g. Campaign ROAS dropped — check it out"
                        className={inputCls}
                      />
                    </div>
                  )}

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

                  {META_ADSET_ACTIONS.includes(form.action_type) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          <label className={labelCls}>New daily budget</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={form.budget}
                              onChange={(e) => setForm({ ...form, budget: e.target.value })}
                              placeholder="50"
                              className={`${inputCls} pl-7`}
                            />
                          </div>
                        </div>
                      )}
                      {BUDGET_PCT_ACTIONS.includes(form.action_type) && (
                        <div>
                          <label className={labelCls}>Adjust by</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="1"
                              value={form.percent}
                              onChange={(e) => setForm({ ...form, percent: e.target.value })}
                              placeholder="20"
                              className={`${inputCls} pr-7`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {META_CAMPAIGN_ACTIONS.includes(form.action_type) && (
                    <div>
                      <label className={labelCls}>Meta Campaign ID</label>
                      <input
                        value={form.campaign_id}
                        onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                        placeholder="e.g. 23856789012345"
                        className={inputCls}
                      />
                    </div>
                  )}

                  {TIKTOK_ADGROUP_ACTIONS.includes(form.action_type) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          <label className={labelCls}>New daily budget <span className="text-ats-text-muted/50">(min $20)</span></label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="20"
                              value={form.budget}
                              onChange={(e) => setForm({ ...form, budget: e.target.value })}
                              placeholder="50"
                              className={`${inputCls} pl-7`}
                            />
                          </div>
                        </div>
                      )}
                      {BUDGET_PCT_ACTIONS.includes(form.action_type) && (
                        <div>
                          <label className={labelCls}>Adjust by</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="1"
                              value={form.percent}
                              onChange={(e) => setForm({ ...form, percent: e.target.value })}
                              placeholder="20"
                              className={`${inputCls} pr-7`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ats-text-muted text-sm">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {TIKTOK_CAMPAIGN_ACTIONS.includes(form.action_type) && (
                    <div>
                      <label className={labelCls}>TikTok Campaign ID</label>
                      <input
                        value={form.campaign_id}
                        onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                        placeholder="e.g. 1789012345678"
                        className={inputCls}
                      />
                    </div>
                  )}

                  {CC_ACTIONS.includes(form.action_type) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Purchase / Subscription ID</label>
                        <input
                          value={form.purchase_id}
                          onChange={(e) => setForm({ ...form, purchase_id: e.target.value })}
                          placeholder="e.g. 12345"
                          className={inputCls}
                        />
                      </div>
                      {form.action_type === 'cancel_cc_subscription' && (
                        <div>
                          <label className={labelCls}>Cancel reason</label>
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

                  {/* No extra fields needed hint */}
                  {form.action_type === 'slack_notify' && (
                    <p className="text-xs text-ats-text-muted/60">Uses your configured Slack webhook. No extra setup needed.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 3: Name & Settings ─────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Rule name</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Kill Losing Meta Campaigns"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Description <span className="text-ats-text-muted/50">(optional)</span></label>
                    <input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Quick note about what this rule does"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>
                    Cooldown — how long to wait before this rule can fire again
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      {[
                        { label: '15m', value: '15' },
                        { label: '30m', value: '30' },
                        { label: '1h', value: '60' },
                        { label: '2h', value: '120' },
                        { label: '4h', value: '240' },
                        { label: '24h', value: '1440' },
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => setForm({ ...form, cooldown_minutes: preset.value })}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
                            form.cooldown_minutes === preset.value
                              ? 'bg-ats-accent text-white'
                              : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:text-ats-text hover:border-ats-text-muted/30'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-ats-text-muted">or</span>
                    <input
                      type="number"
                      value={form.cooldown_minutes}
                      onChange={(e) => setForm({ ...form, cooldown_minutes: e.target.value })}
                      className={`${inputCls} w-20 text-center`}
                      min="0"
                    />
                    <span className="text-xs text-ats-text-muted">min</span>
                  </div>
                  <p className="text-[10px] text-ats-text-muted/60 mt-1.5">
                    Tip: Use 1h for alerts, 2h+ for budget changes to avoid rapid-fire adjustments
                  </p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-ats-border">
              <div>
                {step > 1 && (
                  <button
                    onClick={() => setStep((step - 1) as WizardStep)}
                    className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text transition-colors"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text transition-colors"
                >
                  Cancel
                </button>
                {step < 3 ? (
                  <button
                    onClick={() => setStep((step + 1) as WizardStep)}
                    disabled={!canAdvance(step)}
                    className="px-5 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty State with Templates ─────────────────────────── */}
      {!showForm && rules.length === 0 && (
        <div>
          <div className="bg-ats-card border border-ats-border rounded-lg p-6 text-center mb-6">
            <p className="text-sm text-ats-text mb-1">No rules yet</p>
            <p className="text-xs text-ats-text-muted mb-4">
              Pick a template below to get started, or create one from scratch.
            </p>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text hover:border-ats-text-muted/30 transition-colors"
            >
              Start from scratch
            </button>
          </div>

          <div>
            <h3 className="text-xs text-ats-text-muted uppercase tracking-wider font-medium mb-3">Quick-start templates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => openFromTemplate(t)}
                  className={`text-left bg-ats-card border rounded-lg p-4 transition-all ${t.color}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-sm font-semibold text-ats-text">{t.name}</span>
                  </div>
                  <p className="text-xs text-ats-text-muted">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Templates strip (when rules exist) ─────────────────── */}
      {!showForm && rules.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-[10px] text-ats-text-muted uppercase tracking-wider font-medium whitespace-nowrap shrink-0">Templates:</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => openFromTemplate(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ats-bg border border-ats-border rounded-lg text-xs text-ats-text-muted hover:text-ats-text hover:border-ats-text-muted/30 transition-colors whitespace-nowrap shrink-0"
              >
                <span>{t.icon}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Rules List ───────────────────────────────────────── */}
      {!showForm && rules.length > 0 && (
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
                          When {triggerDesc}
                        </div>
                        <div className="text-xs text-ats-accent mt-0.5">
                          {actionLabel}
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
                      <p className="text-xs text-ats-text-muted">No executions yet — rule hasn't fired.</p>
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
