import { TOUR_STEPS, useTourStore } from '../../stores/tourStore';

interface TourTooltipProps {
  targetRect: DOMRect;
}

export default function TourTooltip({ targetRect }: TourTooltipProps) {
  const { currentStep, next, back, skip } = useTourStore();
  const step = TOUR_STEPS[currentStep];
  if (!step) return null;

  const total = TOUR_STEPS.length;
  const isFirst = currentStep === 0;
  const isLast = currentStep === total - 1;

  // Only allow skipping after the data provider connection step is completed
  const connectionStepIdx = TOUR_STEPS.findIndex(s => s.waitForEvent);
  const canSkip = connectionStepIdx < 0 || currentStep > connectionStepIdx;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 640;

  // On mobile: full-width bottom sheet. On desktop: floating tooltip near target.
  if (isMobile) {
    return (
      <div
        className="fixed left-0 right-0 bottom-0 z-[10002] animate-in fade-in slide-in-from-bottom-4 duration-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="bg-ats-card border-t border-ats-border rounded-t-2xl shadow-2xl px-5 pt-4 pb-5">
          {/* Step counter + skip */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-ats-text-muted font-mono uppercase tracking-widest">
              Step {currentStep + 1} of {total}
            </span>
            {canSkip && (
              <button
                onClick={skip}
                className="text-xs text-ats-text-muted hover:text-ats-text transition-colors min-h-[44px] flex items-center px-2 -mr-2"
              >
                Skip tour
              </button>
            )}
          </div>

          <h3 className="text-base font-bold text-ats-text mb-1">{step.title}</h3>
          <p className="text-sm text-ats-text-muted leading-relaxed mb-5">{step.description}</p>

          {/* Navigation buttons — full-width stacked on mobile */}
          <div className="flex flex-col gap-2">
            {!step.advanceOnClick && !step.waitForEvent && (
              <button
                onClick={isLast ? () => useTourStore.getState().complete() : next}
                className="w-full min-h-[48px] text-sm font-semibold text-white bg-ats-accent rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all"
              >
                {isLast ? 'Finish' : 'Next'}
              </button>
            )}
            {step.advanceOnClick && (
              <div className="text-xs text-ats-accent font-medium animate-pulse text-center min-h-[48px] flex items-center justify-center">
                Tap the highlighted element above
              </div>
            )}
            {step.waitForEvent && (
              <div className="text-xs text-ats-accent font-medium animate-pulse text-center min-h-[48px] flex items-center justify-center">
                Waiting for connection...
              </div>
            )}
            {!isFirst && !step.advanceOnClick && (
              <button
                onClick={back}
                className="w-full min-h-[44px] text-sm font-medium text-ats-text-muted border border-ats-border rounded-xl hover:bg-ats-hover active:scale-[0.98] transition-all"
              >
                Back
              </button>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5 justify-center mt-4">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? 'bg-ats-accent' : i < currentStep ? 'bg-ats-accent/40' : 'bg-ats-border'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: floating tooltip positioned near the target
  const gap = 12;
  const tooltipWidth = Math.min(340, vw - 32);
  const spaceBelow = vh - targetRect.bottom;
  const placeBelow = spaceBelow > 220;

  const top = placeBelow ? targetRect.bottom + gap : targetRect.top - gap;
  let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
  left = Math.max(16, Math.min(left, vw - tooltipWidth - 16));

  return (
    <div
      className="fixed z-[10002] animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        top: placeBelow ? top : undefined,
        bottom: placeBelow ? undefined : vh - top,
        left,
        width: tooltipWidth,
      }}
    >
      <div className="bg-ats-card border border-ats-border rounded-xl shadow-2xl p-4">
        {/* Step counter */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-ats-text-muted font-mono uppercase tracking-widest">
            Step {currentStep + 1} of {total}
          </span>
          {canSkip && (
            <button
              onClick={skip}
              className="text-xs text-ats-text-muted hover:text-ats-text transition-colors min-h-[36px] flex items-center px-1"
            >
              Skip tour
            </button>
          )}
        </div>

        <h3 className="text-sm font-bold text-ats-text mb-1">{step.title}</h3>
        <p className="text-xs text-ats-text-muted leading-relaxed mb-4">{step.description}</p>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          {!isFirst && !step.advanceOnClick && (
            <button
              onClick={back}
              className="px-4 min-h-[36px] text-xs font-medium text-ats-text-muted hover:text-ats-text border border-ats-border rounded-lg hover:bg-ats-hover transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {!step.advanceOnClick && !step.waitForEvent && (
            <button
              onClick={isLast ? () => useTourStore.getState().complete() : next}
              className="px-5 min-h-[36px] text-xs font-semibold text-white bg-ats-accent rounded-lg hover:bg-blue-600 transition-colors"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          )}
          {step.advanceOnClick && (
            <span className="text-[11px] text-ats-accent font-medium animate-pulse">
              Click the highlighted element
            </span>
          )}
          {step.waitForEvent && (
            <span className="text-[11px] text-ats-accent font-medium animate-pulse">
              Waiting for connection...
            </span>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1 justify-center mt-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentStep ? 'bg-ats-accent' : i < currentStep ? 'bg-ats-accent/40' : 'bg-ats-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
