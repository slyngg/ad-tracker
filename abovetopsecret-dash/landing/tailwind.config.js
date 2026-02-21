/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{js,ts}'],
  theme: {
    extend: {
      colors: {
        'od-bg': '#030712',
        'od-card': '#111827',
        'od-border': '#1f2937',
        'od-surface': '#0a0f1a',
        'od-hover': '#1a2332',
        'od-text': '#f9fafb',
        'od-text-secondary': '#d1d5db',
        'od-text-muted': '#6b7280',
        'od-accent': '#3b82f6',
        'od-accent-hover': '#2563eb',
        'od-green': '#10b981',
        'od-yellow': '#f59e0b',
        'od-red': '#ef4444',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
};
