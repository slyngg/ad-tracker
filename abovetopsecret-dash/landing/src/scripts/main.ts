// Nav: transparent → solid on scroll
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

// Mobile menu toggle
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

  // Close mobile menu when clicking a link
  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

// Smooth scroll for anchor links (fallback for browsers without CSS scroll-behavior)
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

// Scroll-triggered animations
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

// Listen for OS theme changes (landing page uses pure system detection)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(e.matches ? 'dark' : 'light');
});
