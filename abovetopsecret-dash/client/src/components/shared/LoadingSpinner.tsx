export default function LoadingSpinner() {
  return (
    <div className="min-h-[50vh] p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-5 w-48 bg-ats-border rounded" />
        <div className="h-3 w-32 bg-ats-border/60 rounded" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-ats-card border border-ats-border rounded-xl p-4 space-y-3">
            <div className="h-3 w-20 bg-ats-border/60 rounded" />
            <div className="h-6 w-28 bg-ats-border rounded" />
            <div className="h-2 w-16 bg-ats-border/40 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-ats-card border border-ats-border rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 px-4 py-3 border-b border-ats-border">
          {[80, 60, 50, 50, 50, 60, 50].map((w, i) => (
            <div key={i} className="h-3 bg-ats-border/60 rounded" style={{ width: `${w}px` }} />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`flex gap-4 px-4 py-3 ${i % 2 === 0 ? 'bg-ats-row-alt' : ''}`}
            style={{ opacity: 1 - i * 0.12 }}
          >
            {[100, 70, 55, 55, 55, 70, 55].map((w, j) => (
              <div key={j} className="h-3 bg-ats-border/50 rounded" style={{ width: `${w}px` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
