// ── Theme management ──
const STORAGE_KEY = 'optic_theme';
type ThemeMode = 'system' | 'light' | 'dark';

function getThemeCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)optic_theme=([^;]*)/);
  return match ? match[1] : null;
}

function setThemeCookie(value: string) {
  const domain = location.hostname.endsWith('optic-data.com') ? '; domain=.optic-data.com' : '';
  document.cookie = `optic_theme=${value}; path=/${domain}; max-age=31536000; SameSite=Lax`;
}

function getStoredMode(): ThemeMode {
  // Cookie is the cross-subdomain source of truth, takes priority over localStorage
  return (getThemeCookie() || localStorage.getItem(STORAGE_KEY) || 'system') as ThemeMode;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);

  // Update meta theme-color
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', resolved === 'dark' ? '#030712' : '#f8fafc');
  });

  // Update toggle button active states
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === mode);
  });
}

function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  setThemeCookie(mode);
  applyTheme(mode);
}

// Initialize theme from stored preference (inline script already set the class,
// but we re-apply here to sync the toggle button states)
applyTheme(getStoredMode());

// Theme toggle click handlers
document.querySelectorAll('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setThemeMode((btn as HTMLElement).dataset.theme as ThemeMode);
  });
});

// Listen for OS theme changes (only applies when in 'system' mode)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredMode() === 'system') {
    applyTheme('system');
  }
});

// ── Nav: transparent → solid on scroll ──
const nav = document.getElementById('nav') as HTMLElement | null;
if (nav) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      nav.classList.add('bg-od-bg/95', 'backdrop-blur-md', 'shadow-lg', 'shadow-black/20');
      nav.classList.remove('bg-transparent');
    } else {
      nav.classList.remove('bg-od-bg/95', 'backdrop-blur-md', 'shadow-lg', 'shadow-black/20');
      nav.classList.add('bg-transparent');
    }
  });
}

// ── Mobile menu toggle ──
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    const isOpen = !mobileMenu.classList.contains('hidden');
    if (isOpen) {
      mobileMenu.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    } else {
      mobileMenu.classList.remove('hidden');
      menuBtn.setAttribute('aria-expanded', 'true');
    }
  });

  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

// ── Smooth scroll for anchor links ──
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = (anchor as HTMLAnchorElement).getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ── Scroll-triggered animations ──
const scrollElements = document.querySelectorAll('.animate-on-scroll');
if (scrollElements.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  scrollElements.forEach((el) => observer.observe(el));
}
