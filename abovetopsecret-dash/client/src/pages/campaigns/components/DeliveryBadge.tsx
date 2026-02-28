interface DeliveryBadgeProps {
  status: 'ACTIVE' | 'PAUSED' | 'UNKNOWN' | string;
}

export default function DeliveryBadge({ status }: DeliveryBadgeProps) {
  const isActive = status === 'ACTIVE';
  const isPaused = status === 'PAUSED';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isActive ? 'bg-emerald-400' : isPaused ? 'bg-zinc-500' : 'bg-zinc-600'
        }`}
      />
      <span
        className={`text-[11px] font-medium ${
          isActive ? 'text-emerald-400' : isPaused ? 'text-zinc-400' : 'text-zinc-500'
        }`}
      >
        {isActive ? 'Active' : isPaused ? 'Paused' : 'Unknown'}
      </span>
    </span>
  );
}
