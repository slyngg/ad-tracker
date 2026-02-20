import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}

export default function AnimatedNumber({
  value,
  format,
  className = '',
  duration = 600,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef<number>(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;

    if (prev === value) return;

    // Flash color
    setFlash(value > prev ? 'up' : 'down');
    const flashTimer = setTimeout(() => setFlash(null), 800);

    // Animate
    const start = performance.now();
    const from = prev;
    const to = value;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearTimeout(flashTimer);
    };
  }, [value, duration]);

  const flashClass = flash === 'up'
    ? 'text-ats-green transition-colors duration-700'
    : flash === 'down'
    ? 'text-ats-red transition-colors duration-700'
    : '';

  return (
    <span className={`${className} ${flashClass}`}>
      {format(display)}
    </span>
  );
}
