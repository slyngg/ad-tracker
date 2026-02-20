/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ats-bg': '#030712',
        'ats-card': '#111827',
        'ats-border': '#1f2937',
        'ats-row-alt': '#0a0f1a',
        'ats-text': '#f9fafb',
        'ats-text-secondary': '#d1d5db',
        'ats-text-muted': '#6b7280',
        'ats-accent': '#3b82f6',
        'ats-green': '#10b981',
        'ats-yellow': '#f59e0b',
        'ats-red': '#ef4444',
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
};
