import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import PageShell from '../../components/shared/PageShell';
import { fetchCreativeDiversity, fetchTagDistribution } from '../../lib/api';
import { getAuthToken } from '../../stores/authStore';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
const DIMENSIONS = [
  { key: 'asset_type', label: 'Asset Type' },
  { key: 'visual_format', label: 'Visual Format' },
  { key: 'hook_type', label: 'Hook Type' },
  { key: 'creative_angle', label: 'Creative Angle' },
  { key: 'messaging_theme', label: 'Messaging Theme' },
  { key: 'talent_type', label: 'Talent Type' },
  { key: 'offer_type', label: 'Offer Type' },
  { key: 'cta_style', label: 'CTA Style' },
];

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

export default function CreativeDiversityPage() {
  const [diversity, setDiversity] = useState<Record<string, Record<string, number>>>({});
  const [distribution, setDistribution] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [aiResult, setAiResult] = useState('');
  const [streaming, setStreaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [div, dist] = await Promise.all([fetchCreativeDiversity(), fetchTagDistribution()]);
      setDiversity(div);
      setDistribution(dist);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const runDiversityCheck = async () => {
    setStreaming(true);
    setAiResult('');
    const token = getAuthToken();
    try {
      const res = await fetch('/api/creatives/ai/diversity-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') setAiResult(prev => prev + parsed.text);
          } catch { /* ignore */ }
        }
      }
    } catch { setAiResult('Error running diversity check.'); }
    finally { setStreaming(false); }
  };

  if (loading) return <PageShell title="Creative Diversity" showDatePicker subtitle="Creative mix analysis"><div className="h-20 bg-ats-card rounded-xl animate-pulse" /></PageShell>;

  return (
    <PageShell title="Creative Diversity" showDatePicker subtitle="Analyze your creative mix across 8 AI-tagged dimensions" actions={
      <button onClick={runDiversityCheck} disabled={streaming}
        className="px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded-lg text-sm font-semibold hover:bg-purple-600/30 disabled:opacity-50">
        {streaming ? 'Analyzing...' : 'AI Diversity Review'}
      </button>
    }>
      {/* AI Analysis */}
      {(aiResult || streaming) && (
        <div className={`${cardCls} mb-6`}>
          <h3 className="text-sm font-semibold text-ats-text mb-2">AI Diversity Analysis</h3>
          <div className="text-sm text-ats-text whitespace-pre-wrap max-h-96 overflow-y-auto">
            {aiResult || 'Analyzing...'}
            {streaming && <span className="inline-block w-2 h-4 bg-ats-accent animate-pulse ml-1" />}
          </div>
        </div>
      )}

      {/* Diversity Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {DIMENSIONS.map(dim => {
          const data = diversity[dim.key] || {};
          const entries = Object.entries(data);
          const total = entries.reduce((sum, [, v]) => sum + v, 0);
          const pieData = entries.map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

          return (
            <div key={dim.key} className={cardCls}>
              <h3 className="text-sm font-semibold text-ats-text mb-3 capitalize">{dim.label}</h3>
              {pieData.length > 0 ? (
                <>
                  <div className="flex justify-center mb-3">
                    <div className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] mx-auto"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius="35%" outerRadius="85%" dataKey="value" stroke="none">{pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                  </div>
                  <div className="space-y-1">
                    {pieData.map((d, i) => {
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
                      const isGap = total > 0 && (d.value / total) < 0.1;
                      return (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className={`text-xs capitalize ${isGap ? 'text-amber-400' : 'text-ats-text-muted'}`}>{d.name}</span>
                          <span className="text-xs font-mono text-ats-text ml-auto">{d.value} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  {entries.some(([, v]) => total > 0 && v / total < 0.1) && (
                    <div className="mt-2 px-2 py-1 bg-amber-500/10 rounded text-[10px] text-amber-400">
                      Gap detected: some categories are underrepresented (&lt;10%)
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-ats-text-muted text-center py-4">No tagged creatives yet</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tag Performance Table */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Tag Performance (30d)</h3>
        <div className="space-y-4">
          {DIMENSIONS.map(dim => {
            const rows = distribution[dim.key] || [];
            if (rows.length === 0) return null;
            return (
              <div key={dim.key}>
                <h4 className="text-xs font-semibold text-ats-text-muted uppercase mb-1">{dim.label}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-ats-border">
                      <th className="px-2 py-1 text-left text-xs sm:text-[10px] uppercase text-ats-text-muted">Value</th>
                      <th className="px-2 py-1 text-right text-xs sm:text-[10px] uppercase text-ats-text-muted">Creatives</th>
                      <th className="px-2 py-1 text-right text-xs sm:text-[10px] uppercase text-ats-text-muted">Spend</th>
                      <th className="px-2 py-1 text-right text-xs sm:text-[10px] uppercase text-ats-text-muted">Avg ROAS</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-ats-border/50 last:border-0">
                          <td className="px-2 py-1 text-xs text-ats-text capitalize">{(r.val || '-').replace(/_/g, ' ')}</td>
                          <td className="px-2 py-1 text-xs font-mono text-ats-text text-right">{r.creative_count}</td>
                          <td className="px-2 py-1 text-xs font-mono text-ats-text text-right">${parseFloat(r.total_spend || 0).toFixed(0)}</td>
                          <td className={`px-2 py-1 text-xs font-mono text-right ${parseFloat(r.avg_roas || 0) >= 2 ? 'text-emerald-400' : 'text-ats-text'}`}>
                            {parseFloat(r.avg_roas || 0).toFixed(2)}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
