import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface StatusToggleProps {
  enabled: boolean;
  onToggle: (enable: boolean) => Promise<void>;
  size?: 'sm' | 'md';
}

export default function StatusToggle({ enabled, onToggle, size = 'sm' }: StatusToggleProps) {
  const [loading, setLoading] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const isOn = optimistic !== null ? optimistic : enabled;

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    const newState = !isOn;
    setOptimistic(newState);
    setLoading(true);
    try {
      await onToggle(newState);
    } catch {
      setOptimistic(null); // revert on error
    } finally {
      setLoading(false);
      setOptimistic(null);
    }
  }

  if (loading) {
    return <Loader2 className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} animate-spin text-ats-text-muted`} />;
  }

  const w = size === 'sm' ? 'w-8' : 'w-10';
  const h = size === 'sm' ? 'h-[18px]' : 'h-[22px]';
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const translate = size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]';

  return (
    <button
      onClick={handleToggle}
      className={`${w} ${h} rounded-full relative transition-colors flex-shrink-0 ${
        isOn ? 'bg-emerald-500' : 'bg-zinc-600'
      }`}
      title={isOn ? 'Active — click to pause' : 'Paused — click to enable'}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${dot} rounded-full bg-white transition-transform ${
          isOn ? translate : 'translate-x-0'
        }`}
      />
    </button>
  );
}
