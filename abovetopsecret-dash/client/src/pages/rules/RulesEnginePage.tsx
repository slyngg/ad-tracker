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

const METRICS = ['spend', 'revenue', 'roas', 'cpa', 'conversions'];
const OPERATORS = ['>', '<', '>=', '<=', '='];
const ACTIONS = [
  { value: 'notification', label: 'Send Notification' },
  { value: 'webhook', label: 'Fire Webhook' },
  { value: 'flag_review', label: 'Flag for Review' },
  { value: 'pause_adset', label: 'Pause Meta Adset' },
  { value: 'enable_adset', label: 'Enable Meta Adset' },
  { value: 'adjust_budget', label: 'Adjust Adset Budget' },
  { value: 'slack_notify', label: 'Slack Notification' },
  { value: 'email_notify', label: 'Email Alert' },
];

interface RuleFormData {
  name: string;
  description: string;
  metric: string;
  operator: string;
  value: string;
  action_type: string;
  action_config: string;
  cooldown_minutes: string;
  adset_id: string;
  budget: string;
}

const EMPTY_FORM: RuleFormData = {
  name: '',
  description: '',
  metric: 'spend',
  operator: '>',
  value: '',
  action_type: 'notification',
  action_config: '',
  cooldown_minutes: '0',
  adset_id: '',
  budget: '',
};

const META_ACTIONS = ['pause_adset', 'enable_adset', 'adjust_budget'];

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
    const am = (rule as any).action_meta || {};
    setForm({
      name: rule.name,
      description: rule.description || '',
      metric: tc.metric || 'spend',
      operator: tc.operator || '>',
      value: String(tc.value ?? ''),
      action_type: rule.action_type,
      action_config: rule.action_config?.webhook_url || rule.action_config?.url || rule.action_config?.message || '',
      cooldown_minutes: String((rule as any).cooldown_minutes ?? '0'),
      adset_id: am.adset_id || rule.action_config?.adset_id || '',
      budget: am.budget || rule.action_config?.budget || '',
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.value.trim()) {
      setMessage({ type: 'error', text: 'Name and threshold value are required' });
      return;
    }
    setSaving(true);
    setMessage(null);

    let action_config: any = {};
    let action_meta: any = {};

    if (form.action_type === 'webhook') {
      action_config = { webhook_url: form.action_config };
    } else if (form.action_type === 'notification') {
      action_config = { message: form.action_config || `${form.name} triggered` };
    } else if (form.action_type === 'email_notify') {
      action_config = { message: form.action_config || `${form.name} triggered` };
    } else if (META_ACTIONS.includes(form.action_type)) {
      action_meta = { adset_id: form.adset_id };
      if (form.action_type === 'adjust_budget') {
        action_meta.budget = form.budget;
      }
    }

    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      trigger_type: 'metric_threshold',
      trigger_config: {
        metric: form.metric,
        operator: form.operator,
        value: parseFloat(form.value),
      },
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

  const formatCooldown = (minutes: number): string => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const inputCls =
    'w-full px-3 py-2 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent';
  const selectCls =
    'px-3 py-2 bg-ats-bg border border-ats-border rounded-md text-ats-text text-sm outline-none focus:border-ats-accent';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-ats-text-muted font-mono text-sm">
        Loading...
      </div>
    );
  }

  return (
    <PageShell
      title="Rules Engine"
      subtitle="Automated alerts and actions based on metric thresholds"
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

      {/* Rule Builder Form */}
      {showForm && (
        <div className="bg-ats-surface border border-ats-border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-bold text-ats-text mb-4">
            {editingId ? 'Edit Rule' : 'Create Rule'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                Rule Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. High spend alert"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                Description (optional)
              </label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this rule does"
                className={inputCls}
              />
            </div>
          </div>

          {/* Condition Builder */}
          <div className="bg-ats-bg border border-ats-border rounded-lg p-4 mb-4">
            <label className="text-[11px] text-ats-text-muted block mb-3 uppercase tracking-wide font-semibold">
              IF condition
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <span className="text-sm text-ats-text font-semibold">IF</span>
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
                className={selectCls}
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
                className={selectCls}
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="Value"
                className={selectCls}
              />
              <span className="text-sm text-ats-text font-semibold">THEN</span>
              <select
                value={form.action_type}
                onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className={selectCls}
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Config */}
          {(form.action_type === 'webhook' || form.action_type === 'notification') && (
            <div className="mb-4">
              <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                {form.action_type === 'webhook' ? 'Webhook URL' : 'Notification Message'}
              </label>
              <input
                value={form.action_config}
                onChange={(e) => setForm({ ...form, action_config: e.target.value })}
                placeholder={
                  form.action_type === 'webhook'
                    ? 'https://hooks.example.com/...'
                    : 'Alert message text'
                }
                className={inputCls}
              />
            </div>
          )}

          {form.action_type === 'email_notify' && (
            <div className="mb-4">
              <label className="text-xs sm:text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                Custom Message (optional)
              </label>
              <input
                value={form.action_config}
                onChange={(e) => setForm({ ...form, action_config: e.target.value })}
                placeholder="Alert message included in the email"
                className={inputCls}
              />
            </div>
          )}

          {/* Meta Action Config */}
          {META_ACTIONS.includes(form.action_type) && (
            <div className="bg-ats-bg border border-ats-border rounded-lg p-4 mb-4">
              <label className="text-[11px] text-ats-text-muted block mb-3 uppercase tracking-wide font-semibold">
                Meta Ads Configuration
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                    Adset ID
                  </label>
                  <input
                    value={form.adset_id}
                    onChange={(e) => setForm({ ...form, adset_id: e.target.value })}
                    placeholder="e.g. 23856789012345"
                    className={inputCls}
                  />
                </div>
                {form.action_type === 'adjust_budget' && (
                  <div>
                    <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
                      Daily Budget ($)
                    </label>
                    <input
                      type="number"
                      value={form.budget}
                      onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      placeholder="e.g. 50"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cooldown */}
          <div className="mb-4">
            <label className="text-[11px] text-ats-text-muted block mb-1 uppercase tracking-wide">
              Cooldown (minutes) — prevents re-firing too quickly
            </label>
            <input
              type="number"
              value={form.cooldown_minutes}
              onChange={(e) => setForm({ ...form, cooldown_minutes: e.target.value })}
              placeholder="0 = no cooldown"
              className={`${inputCls} sm:max-w-[200px]`}
            />
          </div>

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

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="bg-ats-card border border-ats-border rounded-lg p-8 text-center">
          <p className="text-sm text-ats-text-muted mb-4">No rules configured yet.</p>
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
            const tc = rule.trigger_config || {};
            const cooldown = (rule as any).cooldown_minutes || 0;
            const lastFired = (rule as any).last_fired_at;
            const actionLabel = ACTIONS.find((a) => a.value === rule.action_type)?.label || rule.action_type;
            return (
              <div key={rule.id}>
                <div className="bg-ats-card border border-ats-border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(rule.id)}
                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                          rule.enabled ? 'bg-ats-green' : 'bg-gray-600'
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
                          IF {tc.metric?.toUpperCase()} {tc.operator} {tc.value} THEN {actionLabel}
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
                                <td className="py-1.5 pr-4 text-ats-text-muted font-mono">
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
                                <td className="py-1.5 pr-4 text-ats-text font-mono">
                                  {JSON.stringify(log.trigger_data)}
                                </td>
                                <td className="py-1.5 text-ats-text font-mono">
                                  {log.error_message || JSON.stringify(log.action_result)}
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
