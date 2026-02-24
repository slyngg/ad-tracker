import { useThemeStore } from '../stores/themeStore';

interface ChartTheme {
  grid: string;
  axisText: string;
  axisLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipLabel: string;
  activeDotStroke: string;
  scrollbar: string;
  scrollbarHover: string;
}

const darkChart: ChartTheme = {
  grid: '#374151',
  axisText: '#6b7280',
  axisLine: '#374151',
  tooltipBg: '#1f2937',
  tooltipBorder: '#374151',
  tooltipText: '#f9fafb',
  tooltipLabel: '#9ca3af',
  activeDotStroke: '#1f2937',
  scrollbar: '#374151',
  scrollbarHover: '#4b5563',
};

const lightChart: ChartTheme = {
  grid: '#e2e8f0',
  axisText: '#64748b',
  axisLine: '#e2e8f0',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  tooltipText: '#0f172a',
  tooltipLabel: '#64748b',
  activeDotStroke: '#ffffff',
  scrollbar: '#cbd5e1',
  scrollbarHover: '#94a3b8',
};

export function useChartTheme(): ChartTheme {
  const resolved = useThemeStore((s) => s.resolved);
  return resolved === 'dark' ? darkChart : lightChart;
}
