import { useNavigate } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import { useAuthStore } from '../stores/authStore';
import { ROUTES } from '../lib/routes';
import { fmt } from '../lib/formatters';
import PageShell from '../components/shared/PageShell';

const WORKSPACES = [
  { label: 'Attribution', desc: 'Campaign performance & ROI', icon: '🎯', path: ROUTES.ATTRIBUTION },
  { label: 'Connections', desc: 'Manage data sources', icon: '🔗', path: ROUTES.CONNECTIONS },
  { label: 'Overrides', desc: 'Metric overrides', icon: '✏️', path: ROUTES.OVERRIDES },
  { label: 'Operator AI', desc: 'Coming soon', icon: '🤖', path: ROUTES.OPERATOR },
  { label: 'Rules Engine', desc: 'Coming soon', icon: '⚡', path: ROUTES.RULES },
];

export default function SummaryDashboard() {
  const handleUnauthorized = useAuthStore((s) => s.handleUnauthorized);
  const { summary, refreshing, refresh } = useMetrics(undefined, undefined, handleUnauthorized);
  const navigate = useNavigate();

  const roiColor = summary
    ? summary.total_roi >= 2 ? 'text-ats-green' : summary.total_roi >= 1 ? 'text-ats-yellow' : 'text-ats-red'
    : 'text-ats-text';

  return (
    <PageShell
      title="Command Center"
      subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      actions={
        <button
          onClick={() => refresh()}
          disabled={refreshing}
          className="bg-ats-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
        >
          {refreshing ? 'Syncing...' : 'Refresh'}
        </button>
      }
    >
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Spend</div>
            <div className="text-2xl font-bold text-ats-text font-mono">{fmt.currency(summary.total_spend)}</div>
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Revenue</div>
            <div className="text-2xl font-bold text-ats-green font-mono">{fmt.currency(summary.total_revenue)}</div>
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">ROAS</div>
            <div className={`text-2xl font-bold font-mono ${roiColor}`}>{fmt.ratio(summary.total_roi)}</div>
          </div>
          <div className="bg-ats-card rounded-xl p-4 border border-ats-border">
            <div className="text-[11px] text-ats-text-muted uppercase tracking-widest font-mono mb-1">Conversions</div>
            <div className="text-2xl font-bold text-ats-text font-mono">{fmt.num(summary.total_conversions)}</div>
          </div>
        </div>
      )}

      {/* Workspace Quick Links */}
      <h2 className="text-sm font-semibold text-ats-text-muted uppercase tracking-wider mb-3">Workspaces</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.path}
            onClick={() => navigate(ws.path)}
            className="bg-ats-card border border-ats-border rounded-xl p-4 text-left hover:bg-ats-hover hover:border-ats-text-muted/30 transition-colors"
          >
            <div className="text-2xl mb-2">{ws.icon}</div>
            <div className="text-sm font-semibold text-ats-text">{ws.label}</div>
            <div className="text-xs text-ats-text-muted mt-0.5">{ws.desc}</div>
          </button>
        ))}
      </div>
    </PageShell>
  );
}
