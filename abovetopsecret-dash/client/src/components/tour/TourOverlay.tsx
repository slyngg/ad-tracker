import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTourStore } from '../../stores/tourStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import TourTooltip from './TourTooltip';

export default function TourOverlay() {
  const { active, currentStep, next, getSteps } = useTourStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number>(0);

  const steps = getSteps();
  const step = active ? steps[currentStep] : null;

  const updateRect = useCallback(() => {
    if (!step) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  // Navigate to the correct route for the current step
  useEffect(() => {
    if (!active || !step) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [active, step, location.pathname, navigate]);

  // For sidebar-targeted steps on mobile, open the sidebar
  useEffect(() => {
    if (!active || !step) return;
    if (step.target.startsWith('nav-')) {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        // Small delay so route navigation settles before opening sidebar
        setTimeout(() => {
          useSidebarStore.getState().setMobileOpen(true);
        }, 50);
      }
    }
  }, [active, step]);

  // Track target element position with ResizeObserver + scroll/resize
  useEffect(() => {
    if (!active || !step) {
      setTargetRect(null);
      return;
    }

    let scrolledIntoView = false;

    // Poll briefly for the element to appear (route transitions, lazy loading)
    let attempts = 0;
    const poll = setInterval(() => {
      updateRect();
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        clearInterval(poll);
        // Scroll the target element into view so it's visible on mobile
        // (e.g. nav items below the fold inside the scrollable sidebar)
        if (!scrolledIntoView) {
          scrolledIntoView = true;
          // Use a short delay to let sidebar open/expand animations finish
          setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Update rect after scroll settles
            setTimeout(updateRect, 350);
          }, 100);
        }
      }
      if (attempts++ > 20) clearInterval(poll);
    }, 150);

    const handleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateRect);
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    // ResizeObserver on target
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      observerRef.current = new ResizeObserver(handleUpdate);
      observerRef.current.observe(el);
    }

    return () => {
      clearInterval(poll);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      observerRef.current?.disconnect();
    };
  }, [active, step, updateRect]);

  // Handle clicks + touch: block everything except the target element and tooltip
  useEffect(() => {
    if (!active || !step) return;

    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;

      // Allow interaction inside the tooltip
      const tooltip = document.querySelector('[data-tour-tooltip]');
      if (tooltip?.contains(target)) return;

      const tourEl = document.querySelector(`[data-tour="${step.target}"]`);

      // Allow interaction on the target element (or its children)
      if (tourEl?.contains(target)) {
        if (step.advanceOnClick) {
          setTimeout(() => next(), 50);
        }
        return;
      }

      // On mobile, allow scrolling within the sidebar so the user can reach
      // nav items that are below the fold (e.g. Settings, Connections)
      if (step.target.startsWith('nav-')) {
        const sidebar = target.closest('aside');
        if (sidebar && e.type === 'touchstart') return; // allow touch-scroll in sidebar
      }

      // Block all other interaction (including when target element isn't found)
      e.preventDefault();
      e.stopPropagation();
    };

    // Capture both mouse and touch events (passive: false needed for preventDefault on mobile)
    document.addEventListener('click', handler, { capture: true });
    document.addEventListener('touchstart', handler, { capture: true, passive: false });
    return () => {
      document.removeEventListener('click', handler, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchstart', handler, { capture: true } as EventListenerOptions);
    };
  }, [active, step, next]);

  if (!active || !step) return null;

  const padding = 6;

  // Fallback rect: center of viewport (used when target element not found)
  const fallbackRect = {
    top: window.innerHeight / 2 - 20,
    left: window.innerWidth / 2 - 20,
    width: 40,
    height: 40,
    bottom: window.innerHeight / 2 + 20,
    right: window.innerWidth / 2 + 20,
  } as DOMRect;

  const displayRect = targetRect || fallbackRect;

  return createPortal(
    <>
      {/* Dim overlay with spotlight cutout using box-shadow */}
      <div
        className="fixed z-[10000] pointer-events-none transition-all duration-300"
        style={
          targetRect
            ? {
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                top: targetRect.top - padding,
                left: targetRect.left - padding,
                width: targetRect.width + padding * 2,
                height: targetRect.height + padding * 2,
                borderRadius: '10px',
                position: 'fixed',
              }
            : {
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
              }
        }
      />
      {/* Click-blocking is handled by the JS capture handler above —
         no CSS blocking div needed (it was intercepting taps on the target) */}
      {/* Tooltip — always shown so user can navigate/skip */}
      <div data-tour-tooltip>
        <TourTooltip targetRect={displayRect} />
      </div>
    </>,
    document.body,
  );
}
