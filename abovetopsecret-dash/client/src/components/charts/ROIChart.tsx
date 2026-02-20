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

interface ROIData {
  date: string;
  roas: number;
}

interface ROIChartProps {
  data: ROIData[];
}

export default function ROIChart({ data }: ROIChartProps) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
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
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#f9fafb',
            fontSize: 12,
          }}
          formatter={(value: number | undefined) => [
            value != null ? `${value.toFixed(2)}x` : '0.00x',
            'ROAS',
          ]}
          labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
        />
        <Line
          type="monotone"
          dataKey="roas"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1f2937', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
