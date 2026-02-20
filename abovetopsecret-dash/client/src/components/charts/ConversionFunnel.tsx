const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#eab308', '#22c55e', '#ef4444', '#6b7280'];

interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

interface ConversionFunnelProps {
  data: FunnelStep[];
}

export default function ConversionFunnel({ data }: ConversionFunnelProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-ats-text-muted text-sm">
        No data available
      </div>
    );
  }

  const topValue = data[0].value;

  return (
    <div className="space-y-1.5">
      {data.map((step, i) => {
        const pctOfTop = topValue > 0 ? (step.value / topValue) * 100 : 0;
        const convFromPrev =
          i > 0 && data[i - 1].value > 0
            ? ((step.value / data[i - 1].value) * 100).toFixed(1)
            : null;
        const barColor = step.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

        return (
          <div key={step.label}>
            {convFromPrev && (
              <div className="text-[10px] text-ats-text-muted font-mono text-center mb-0.5">
                {convFromPrev}% conversion
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-16 sm:w-28 shrink-0 text-right">
                <span className="text-[11px] sm:text-xs text-ats-text truncate block">{step.label}</span>
              </div>
              <div className="flex-1 relative h-8 bg-ats-bg rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${Math.max(pctOfTop, 2)}%`,
                    backgroundColor: barColor,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="w-20 sm:w-24 shrink-0 text-left">
                <span className="text-sm font-mono font-semibold text-ats-text">
                  {step.value.toLocaleString()}
                </span>
                <span className="text-[10px] text-ats-text-muted ml-1">
                  ({pctOfTop.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
