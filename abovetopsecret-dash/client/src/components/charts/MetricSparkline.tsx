import { ResponsiveContainer, LineChart, Line } from 'recharts';

interface MetricSparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export default function MetricSparkline({
  data,
  color = '#3b82f6',
  height = 30,
}: MetricSparklineProps) {
  if (!data.length) return null;

  const points = data.map((value, i) => ({ i, v: value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
