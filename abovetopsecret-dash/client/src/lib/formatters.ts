const n = (v: unknown): number => typeof v === 'number' ? v : parseFloat(String(v));
const bad = (v: number): boolean => v == null || !isFinite(v);

export const fmt = {
  currency: (v: number): string => { const x = n(v); return bad(x) ? '--' : x >= 1000 ? `$${(x / 1000).toFixed(1)}K` : `$${x.toFixed(2)}`; },

  pct: (v: number): string => { const x = n(v); return bad(x) ? '--' : `${(x * 100).toFixed(1)}%`; },

  pctRaw: (v: number): string => { const x = n(v); return bad(x) ? '--' : `${x.toFixed(1)}%`; },

  ratio: (v: number): string => { const x = n(v); return bad(x) ? '--' : `${x.toFixed(2)}x`; },

  num: (v: number): string => { const x = n(v); return bad(x) ? '--' : x.toLocaleString(); },
};
