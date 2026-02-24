/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{js,ts}'],
  theme: {
    extend: {
      colors: {
        'od-bg': 'rgb(var(--od-bg) / <alpha-value>)',
        'od-card': 'rgb(var(--od-card) / <alpha-value>)',
        'od-border': 'rgb(var(--od-border) / <alpha-value>)',
        'od-surface': 'rgb(var(--od-surface) / <alpha-value>)',
        'od-hover': 'rgb(var(--od-hover) / <alpha-value>)',
        'od-text': 'rgb(var(--od-text) / <alpha-value>)',
        'od-text-secondary': 'rgb(var(--od-text-secondary) / <alpha-value>)',
        'od-text-muted': 'rgb(var(--od-text-muted) / <alpha-value>)',
        'od-accent': 'rgb(var(--od-accent) / <alpha-value>)',
        'od-accent-hover': 'rgb(var(--od-accent-hover) / <alpha-value>)',
        'od-green': 'rgb(var(--od-green) / <alpha-value>)',
        'od-yellow': 'rgb(var(--od-yellow) / <alpha-value>)',
        'od-red': 'rgb(var(--od-red) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
};
