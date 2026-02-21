import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTourStore, TOUR_STEPS } from '../../stores/tourStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import TourTooltip from './TourTooltip';

export default function TourOverlay() {
  const { active, currentStep, next } = useTourStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number>(0);

  const step = active ? TOUR_STEPS[currentStep] : null;

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
        useSidebarStore.getState().setMobileOpen(true);
      }
    }
  }, [active, step]);

  // Track target element position with ResizeObserver + scroll/resize
  useEffect(() => {
    if (!active || !step) {
      setTargetRect(null);
      return;
    }

    // Poll briefly for the element to appear (route transitions, lazy loading)
    let attempts = 0;
    const poll = setInterval(() => {
      updateRect();
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el || attempts++ > 20) clearInterval(poll);
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
      const tourEl = document.querySelector(`[data-tour="${step.target}"]`);
      if (!tourEl) return;

      // Allow interaction inside the tooltip
      const tooltip = document.querySelector('[data-tour-tooltip]');
      if (tooltip?.contains(target)) return;

      // Allow interaction on the target element (or its children)
      if (tourEl.contains(target)) {
        if (step.advanceOnClick) {
          setTimeout(() => next(), 50);
        }
        return;
      }

      // Block all other interaction
      e.preventDefault();
      e.stopPropagation();
    };

    // Capture both mouse and touch events
    document.addEventListener('click', handler, true);
    document.addEventListener('touchstart', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
  }, [active, step, next]);

  if (!active || !step) return null;

  const padding = 6;

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
                background: 'rgba(0, 0, 0, 0.65)',
              }
        }
      />
      {/* Click-blocking layer */}
      <div className="fixed inset-0 z-[10001]" style={{ pointerEvents: 'auto' }}>
        {targetRect && (
          <div
            style={{
              position: 'fixed',
              top: targetRect.top - padding,
              left: targetRect.left - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {/* Tooltip */}
      {targetRect && (
        <div data-tour-tooltip>
          <TourTooltip targetRect={targetRect} />
        </div>
      )}
    </>,
    document.body,
  );
}
