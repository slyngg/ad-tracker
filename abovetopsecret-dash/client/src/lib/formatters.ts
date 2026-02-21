const bad = (v: number): boolean => v == null || !isFinite(v);

export const fmt = {
  currency: (v: number): string =>
    bad(v) ? '--' : v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`,

  pct: (v: number): string => (bad(v) ? '--' : `${(v * 100).toFixed(1)}%`),

  pctRaw: (v: number): string => (bad(v) ? '--' : `${v.toFixed(1)}%`),

  ratio: (v: number): string => (bad(v) ? '--' : `${v.toFixed(2)}x`),

  num: (v: number): string => (bad(v) ? '--' : v.toLocaleString()),
};
