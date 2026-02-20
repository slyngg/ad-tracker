import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { NAV_SECTIONS, ROUTES } from '../../lib/routes';

interface SearchItem {
  label: string;
  path: string;
  section?: string;
}

function getAllPages(): SearchItem[] {
  const pages: SearchItem[] = [];
  for (const section of NAV_SECTIONS) {
    if (section.path) {
      pages.push({ label: section.label, path: section.path });
    }
    if (section.children) {
      for (const child of section.children) {
        pages.push({ label: child.label, path: child.path, section: section.label });
      }
    }
  }
  return pages;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const allPages = getAllPages();
  const filtered = query.trim()
    ? allPages.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        (p.section || '').toLowerCase().includes(query.toLowerCase())
      )
    : allPages;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen(prev => !prev);
      setQuery('');
      setSelectedIndex(0);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      handleSelect(filtered[selectedIndex].path);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative bg-ats-card border border-ats-border rounded-xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ats-border">
          <Search size={16} className="text-ats-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-ats-text text-sm outline-none placeholder:text-ats-text-muted"
          />
          <kbd className="text-[10px] text-ats-text-muted bg-ats-bg border border-ats-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ats-text-muted">No results found</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.path}
                onClick={() => handleSelect(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === selectedIndex ? 'bg-ats-accent/10 text-ats-accent' : 'text-ats-text hover:bg-ats-hover'
                }`}
              >
                <span className="font-medium">{item.label}</span>
                {item.section && (
                  <span className="text-xs text-ats-text-muted ml-auto">{item.section}</span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-ats-border flex items-center gap-4 text-[10px] text-ats-text-muted">
          <span><kbd className="bg-ats-bg border border-ats-border rounded px-1 py-0.5 mr-1">↑↓</kbd> Navigate</span>
          <span><kbd className="bg-ats-bg border border-ats-border rounded px-1 py-0.5 mr-1">↵</kbd> Open</span>
          <span><kbd className="bg-ats-bg border border-ats-border rounded px-1 py-0.5 mr-1">⌘K</kbd> Toggle</span>
        </div>
      </div>
    </div>
  );
}
