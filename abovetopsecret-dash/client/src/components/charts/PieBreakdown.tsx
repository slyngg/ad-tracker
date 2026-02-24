import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ef4444', '#6b7280'];

interface PieSlice {
  name: string;
  value: number;
}

interface PieBreakdownProps {
  data: PieSlice[];
  title?: string;
}

export default function PieBreakdown({ data, title }: PieBreakdownProps) {
  const ct = useChartTheme();

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">
        No data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      {title && (
        <h3 className="text-sm font-semibold text-ats-text mb-2">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: ct.tooltipBg,
              border: `1px solid ${ct.tooltipBorder}`,
              borderRadius: '8px',
              color: ct.tooltipText,
              fontSize: 12,
            }}
            formatter={(value: number | undefined, name: string | undefined) => {
              const v = value ?? 0;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
              return [`${v.toLocaleString()} (${pct}%)`, name ?? ''];
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-xs text-ats-text-muted">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
