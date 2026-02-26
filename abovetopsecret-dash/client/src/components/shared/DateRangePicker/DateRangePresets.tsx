import { PRESETS, isSameDay, type PresetDef } from './presets';

interface DateRangePresetsProps {
  selectedPresetId: string | undefined;
  onSelect: (preset: PresetDef) => void;
  isMobile: boolean;
}

export default function DateRangePresets({ selectedPresetId, onSelect, isMobile }: DateRangePresetsProps) {
  if (isMobile) {
    return (
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-ats-border scrollbar-none">
        {PRESETS.map((p) => {
          const active = selectedPresetId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                active
                  ? 'bg-ats-accent text-white'
                  : 'text-ats-text-muted hover:text-ats-text bg-white/5 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col py-2 border-r border-ats-border min-w-[190px] max-h-[400px] overflow-y-auto">
      {PRESETS.map((p) => {
        const active = selectedPresetId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors"
          >
            {/* Radio circle */}
            <span
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                active ? 'border-ats-accent' : 'border-ats-text-muted/40'
              }`}
            >
              {active && <span className="w-2 h-2 rounded-full bg-ats-accent" />}
            </span>
            <span className={`${active ? 'text-ats-text font-medium' : 'text-ats-text-muted'}`}>
              {p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
