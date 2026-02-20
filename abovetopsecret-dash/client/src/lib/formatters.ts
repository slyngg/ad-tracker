export const fmt = {
  currency: (v: number): string =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`,

  pct: (v: number): string => `${(v * 100).toFixed(1)}%`,

  pctRaw: (v: number): string => `${v.toFixed(1)}%`,

  ratio: (v: number): string => `${v.toFixed(2)}x`,

  num: (v: number): string => v.toLocaleString(),
};
