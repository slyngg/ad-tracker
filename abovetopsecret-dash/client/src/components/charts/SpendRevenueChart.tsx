import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface SpendRevenueData {
  date: string;
  spend: number;
  revenue: number;
}

interface SpendRevenueChartProps {
  data: SpendRevenueData[];
}

function formatDollar(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function SpendRevenueChart({ data }: SpendRevenueChartProps) {
  const ct = useChartTheme();

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: ct.axisText, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: ct.axisLine }}
        />
        <YAxis
          tickFormatter={formatDollar}
          tick={{ fill: ct.axisText, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: ct.tooltipBg,
            border: `1px solid ${ct.tooltipBorder}`,
            borderRadius: '8px',
            color: ct.tooltipText,
            fontSize: 12,
          }}
          formatter={(value: number | undefined, name: string | undefined) => [
            value != null
              ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '$0.00',
            name ? name.charAt(0).toUpperCase() + name.slice(1) : '',
          ]}
          labelStyle={{ color: ct.tooltipLabel, marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="spend"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#gradSpend)"
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#gradRevenue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
