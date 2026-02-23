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
        'ats-surface': '#0a0f1a',
        'ats-hover': '#1a2332',
        'ats-text': '#f9fafb',
        'ats-text-secondary': '#d1d5db',
        'ats-text-muted': '#6b7280',
        'ats-accent': '#3b82f6',
        'ats-green': '#10b981',
        'ats-yellow': '#f59e0b',
        'ats-red': '#ef4444',
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "sans-serif"],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      width: {
        'sidebar': '260px',
        'sidebar-collapsed': '64px',
      },
      spacing: {
        'sidebar': '260px',
        'sidebar-collapsed': '64px',
        'bottom-bar': '56px',
      },
      height: {
        'bottom-bar': '56px',
      },
      keyframes: {
        'pulse-once': {
          '0%': { opacity: '0.6' },
          '50%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-once': 'pulse-once 1s ease-out',
      },
    },
  },
  plugins: [],
};
