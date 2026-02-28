export function fmt$(v: number): string {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNum(v: number): string {
  return v.toLocaleString();
}

export function fmtRoas(v: number): string {
  return v.toFixed(2) + 'x';
}

export function fmtPct(v: number): string {
  return v.toFixed(2) + '%';
}

export function fmtCurrency(v: number): string {
  return '$' + v.toFixed(2);
}
