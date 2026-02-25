/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ats-bg': 'var(--ats-bg)',
        'ats-card': 'var(--ats-card)',
        'ats-border': 'var(--ats-border)',
        'ats-row-alt': 'var(--ats-row-alt)',
        'ats-surface': 'var(--ats-surface)',
        'ats-hover': 'var(--ats-hover)',
        'ats-text': 'var(--ats-text)',
        'ats-text-secondary': 'var(--ats-text-secondary)',
        'ats-text-muted': 'var(--ats-text-muted)',
        'ats-accent': 'var(--ats-accent)',
        'ats-green': 'var(--ats-green)',
        'ats-yellow': 'var(--ats-yellow)',
        'ats-red': 'var(--ats-red)',
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
        'fade-in': {
          '0%': { opacity: '0', transform: 'translate(-50%, 4px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
      },
      animation: {
        'pulse-once': 'pulse-once 1s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
