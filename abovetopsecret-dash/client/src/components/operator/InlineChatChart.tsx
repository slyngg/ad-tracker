import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

export interface ChartYKey {
  key: string;
  label?: string;
  color?: string;
  format?: 'currency' | 'percent' | 'number' | 'ratio';
}

export interface ChartKpi {
  label: string;
  value: number | string;
  format?: 'currency' | 'percent' | 'number' | 'ratio';
  delta?: number;
}

export interface ChartSpec {
  id: string;
  type: 'line' | 'bar' | 'area' | 'kpi' | 'pie';
  title: string;
  data?: Record<string, any>[];
  xKey?: string;
  yKeys?: ChartYKey[];
  kpis?: ChartKpi[];
}

const DEFAULT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatValue(value: number | string | undefined, format?: string): string {
  if (value == null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  switch (format) {
    case 'currency':
      if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
      if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
      return `$${num.toFixed(2)}`;
    case 'percent':
      return `${(num * 100).toFixed(1)}%`;
    case 'ratio':
      return `${num.toFixed(2)}x`;
    case 'number':
      return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    default:
      if (typeof value === 'number') {
        return num % 1 === 0 ? num.toLocaleString('en-US') : num.toFixed(2);
      }
      return String(value);
  }
}

interface Props {
  spec: ChartSpec;
}

export default function InlineChatChart({ spec }: Props) {
  const ct = useChartTheme();

  if (spec.type === 'kpi') {
    return <KpiCards spec={spec} />;
  }

  if (!spec.data || spec.data.length === 0) {
    return (
      <div className="my-2 p-3 rounded-lg bg-ats-bg/50 border border-ats-border text-xs text-ats-text-muted text-center">
        No data available
      </div>
    );
  }

  const yKeys = spec.yKeys || [];
  const xKey = spec.xKey || 'x';

  const tooltipStyle = {
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    borderRadius: '8px',
    color: ct.tooltipText,
    fontSize: 11,
  };

  const commonAxisProps = {
    tick: { fill: ct.axisText, fontSize: 10 },
    tickLine: false,
  };

  return (
    <div className="my-2 rounded-lg bg-ats-bg/50 border border-ats-border overflow-hidden">
      <div className="px-3 pt-2 pb-1 text-xs font-semibold text-ats-text">{spec.title}</div>
      <div className="px-1 pb-2">
        <ResponsiveContainer width="100%" height={180}>
          {spec.type === 'line' ? (
            <LineChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey={xKey} {...commonAxisProps} axisLine={{ stroke: ct.axisLine }} />
              <YAxis
                {...commonAxisProps}
                axisLine={false}
                width={48}
                tickFormatter={yKeys[0]?.format ? (v: number) => formatValue(v, yKeys[0].format) : undefined}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: ct.tooltipLabel, marginBottom: 2 }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const yk = yKeys.find((y) => y.key === name);
                  return [formatValue(value ?? 0, yk?.format), yk?.label || name || ''];
                }}
              />
              {yKeys.map((yk, i) => (
                <Line
                  key={yk.key}
                  type="monotone"
                  dataKey={yk.key}
                  name={yk.key}
                  stroke={yk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1, stroke: ct.activeDotStroke }}
                />
              ))}
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </LineChart>
          ) : spec.type === 'area' ? (
            <AreaChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {yKeys.map((yk, i) => {
                  const color = yk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                  return (
                    <linearGradient key={yk.key} id={`grad-${spec.id}-${yk.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey={xKey} {...commonAxisProps} axisLine={{ stroke: ct.axisLine }} />
              <YAxis
                {...commonAxisProps}
                axisLine={false}
                width={48}
                tickFormatter={yKeys[0]?.format ? (v: number) => formatValue(v, yKeys[0].format) : undefined}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: ct.tooltipLabel, marginBottom: 2 }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const yk = yKeys.find((y) => y.key === name);
                  return [formatValue(value ?? 0, yk?.format), yk?.label || name || ''];
                }}
              />
              {yKeys.map((yk, i) => {
                const color = yk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                return (
                  <Area
                    key={yk.key}
                    type="monotone"
                    dataKey={yk.key}
                    name={yk.key}
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#grad-${spec.id}-${yk.key})`}
                  />
                );
              })}
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </AreaChart>
          ) : spec.type === 'bar' ? (
            <BarChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey={xKey} {...commonAxisProps} axisLine={{ stroke: ct.axisLine }} />
              <YAxis
                {...commonAxisProps}
                axisLine={false}
                width={48}
                tickFormatter={yKeys[0]?.format ? (v: number) => formatValue(v, yKeys[0].format) : undefined}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: ct.tooltipLabel, marginBottom: 2 }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const yk = yKeys.find((y) => y.key === name);
                  return [formatValue(value ?? 0, yk?.format), yk?.label || name || ''];
                }}
              />
              {yKeys.map((yk, i) => (
                <Bar
                  key={yk.key}
                  dataKey={yk.key}
                  name={yk.key}
                  fill={yk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </BarChart>
          ) : (
            <PieChartRenderer spec={spec} ct={ct} tooltipStyle={tooltipStyle} />
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PieChartRenderer({
  spec,
  ct,
  tooltipStyle,
}: {
  spec: ChartSpec;
  ct: ReturnType<typeof useChartTheme>;
  tooltipStyle: React.CSSProperties;
}) {
  const data = spec.data || [];
  const xKey = spec.xKey || 'name';
  const valueKey = spec.yKeys?.[0]?.key || 'value';
  const format = spec.yKeys?.[0]?.format;

  return (
    <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
      <Pie
        data={data}
        dataKey={valueKey}
        nameKey={xKey}
        cx="50%"
        cy="50%"
        innerRadius={40}
        outerRadius={70}
        paddingAngle={2}
        label={({ name, percent }: { name?: string; percent?: number }) =>
          `${name || ''}: ${((percent ?? 0) * 100).toFixed(0)}%`
        }
        labelLine={false}
        style={{ fontSize: 9, fill: ct.axisText }}
      >
        {data.map((_: any, i: number) => (
          <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={tooltipStyle}
        formatter={(value: number | undefined) => [formatValue(value ?? 0, format)]}
      />
    </PieChart>
  );
}

function KpiCards({ spec }: { spec: ChartSpec }) {
  const kpis = spec.kpis || [];
  if (kpis.length === 0) {
    return (
      <div className="my-2 p-3 rounded-lg bg-ats-bg/50 border border-ats-border text-xs text-ats-text-muted text-center">
        No data available
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg bg-ats-bg/50 border border-ats-border overflow-hidden">
      <div className="px-3 pt-2 pb-1 text-xs font-semibold text-ats-text">{spec.title}</div>
      <div className="grid grid-cols-2 gap-2 p-2">
        {kpis.map((kpi, i) => (
          <div key={i} className="rounded-lg bg-ats-card border border-ats-border/50 px-3 py-2">
            <div className="text-[10px] text-ats-text-muted uppercase tracking-wide">{kpi.label}</div>
            <div className="text-lg font-bold text-ats-text mt-0.5 leading-tight">
              {formatValue(kpi.value, kpi.format)}
            </div>
            {kpi.delta != null && (
              <div className={`text-[10px] font-medium mt-0.5 ${kpi.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {kpi.delta >= 0 ? '+' : ''}{kpi.delta.toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
