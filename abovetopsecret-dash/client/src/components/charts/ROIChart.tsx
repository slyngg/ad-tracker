import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface ROIData {
  date: string;
  roas: number;
}

interface ROIChartProps {
  data: ROIData[];
}

export default function ROIChart({ data }: ROIChartProps) {
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
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: ct.axisText, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: ct.axisLine }}
        />
        <YAxis
          tick={{ fill: ct.axisText, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${v.toFixed(1)}x`}
        />
        <ReferenceLine
          y={1}
          stroke="#ef4444"
          strokeDasharray="6 4"
          strokeWidth={1.5}
          label={{
            value: 'Break-even',
            position: 'insideTopRight',
            fill: '#ef4444',
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: ct.tooltipBg,
            border: `1px solid ${ct.tooltipBorder}`,
            borderRadius: '8px',
            color: ct.tooltipText,
            fontSize: 12,
          }}
          formatter={(value: number | undefined) => [
            value != null ? `${value.toFixed(2)}x` : '0.00x',
            'ROAS',
          ]}
          labelStyle={{ color: ct.tooltipLabel, marginBottom: 4 }}
        />
        <Line
          type="monotone"
          dataKey="roas"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6', stroke: ct.activeDotStroke, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
