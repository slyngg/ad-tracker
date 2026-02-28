import { useState, useCallback } from 'react';
import { COLUMN_PRESETS } from '../constants';
import type { ColumnPreset } from '../types';
import { ALL_COLUMNS } from '../types';

const STORAGE_KEY = 'campaign-manager-columns';
const PRESET_KEY = 'campaign-manager-column-preset';

function loadFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...COLUMN_PRESETS.performance];
}

function loadPreset(): ColumnPreset {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw && ['performance', 'engagement', 'all', 'custom'].includes(raw)) return raw as ColumnPreset;
  } catch {}
  return 'performance';
}

export default function useColumnPrefs() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadFromStorage);
  const [preset, setPreset] = useState<ColumnPreset>(loadPreset);

  const applyPreset = useCallback((p: ColumnPreset) => {
    setPreset(p);
    localStorage.setItem(PRESET_KEY, p);
    if (p !== 'custom') {
      const cols = [...COLUMN_PRESETS[p]];
      setVisibleColumns(cols);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
    }
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPreset('custom');
      localStorage.setItem(PRESET_KEY, 'custom');
      return next;
    });
  }, []);

  const columns = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key));

  return { visibleColumns, columns, preset, applyPreset, toggleColumn };
}
