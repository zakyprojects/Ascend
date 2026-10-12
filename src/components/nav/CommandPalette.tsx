import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Dialog, cx } from '@/components/ui/primitives';
import type { View } from '@/components/AppShell';
import { NAV_DASHBOARD, NAV_GROUPS, NAV_SETTINGS, NavEntry } from './navConfig';
import { IS_APPLE_PLATFORM } from '@/lib/platform';

/** "g" then this key jumps to the page. Kept to the most visited pages so the letters stay memorable. */
const GO_KEYS: Partial<Record<View, string>> = {
  dashboard: 'd',
  habits: 'h',
  'time-tracker': 't',
  'weekly-goals': 'w',
  journal: 'j',
  leagues: 'l',
  settings: 's',
};
const VIEW_BY_GO_KEY = new Map(Object.entries(GO_KEYS).map(([view, key]) => [key, view as View]));

// A "g" waits this long for its second key, like GitHub and Gmail.
const SEQUENCE_MS = 1200;

interface PaletteEntry extends NavEntry {
  group: string;
}

const ENTRIES: PaletteEntry[] = [
  { ...NAV_DASHBOARD, group: 'Home' },
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
  { ...NAV_SETTINGS, group: 'App' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function anyDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

/**
 * Ctrl/Cmd+K opens a "go to page" search; "g" + a letter jumps straight to a common page.
 * Shortcuts never fire while the user types in a field or while another dialog is open.
 */
export function CommandPalette({ open, onOpenChange, currentView, onViewChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  // Global shortcuts. Handlers read the latest props through a ref so the listener binds once.
  const latest = useRef({ open, onOpenChange, onViewChange });
  latest.current = { open, onOpenChange, onViewChange };
  useEffect(() => {
    let pendingG = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const { open: isOpen, onOpenChange: setOpen, onViewChange: go } = latest.current;
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey) {
        if (!isOpen && anyDialogOpen()) return;
        event.preventDefault();
        setOpen(!isOpen);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target) || anyDialogOpen()) {
        pendingG = 0;
        return;
      }
      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < SEQUENCE_MS) {
        pendingG = 0;
        const view = VIEW_BY_GO_KEY.get(key);
        if (view) {
          event.preventDefault();
          go(view);
        }
        return;
      }
      pendingG = key === 'g' && !event.shiftKey ? Date.now() : 0;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // A fresh search each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter((entry) => entry.label.toLowerCase().includes(q) || entry.group.toLowerCase().includes(q));
  }, [query]);

  const select = (view: View) => {
    onOpenChange(false);
    if (view !== currentView) onViewChange(view);
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (i + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(results[Math.min(activeIndex, results.length - 1)].id);
    }
  };

  const optionId = (view: View) => `${listId}-${view}`;
  const active = results[Math.min(activeIndex, results.length - 1)];

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} title="Go to" maxWidth="max-w-lg" placement="top">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={active ? optionId(active.id) : undefined}
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            className="input-field input-has-icon"
          />
        </div>

        {results.length === 0 ? (
          <p className="py-6 text-center text-xs text-content-muted">No page matches “{query.trim()}”</p>
        ) : (
          <ul ref={listRef} id={listId} role="listbox" aria-label="Pages" className="max-h-[50dvh] overflow-y-auto space-y-0.5">
            {results.map((entry, idx) => {
              const Icon = entry.icon;
              const selected = entry === active;
              const goKey = GO_KEYS[entry.id];
              return (
                <li
                  key={entry.id}
                  id={optionId(entry.id)}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => idx !== activeIndex && setActiveIndex(idx)}
                  onClick={() => select(entry.id)}
                  className={cx(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-fast',
                    selected ? 'bg-primary-500/15 text-content-primary' : 'text-content-secondary'
                  )}
                >
                  <Icon size={16} aria-hidden="true" className={selected ? 'text-brand-text' : 'text-content-muted'} />
                  <span className="flex-1 truncate font-medium">{entry.label}</span>
                  {entry.id === currentView && <span className="text-2xs text-content-disabled">Current</span>}
                  <span className="text-2xs text-content-disabled">{entry.group}</span>
                  {goKey && (
                    <span className="hidden sm:inline-flex gap-0.5" aria-label={`Shortcut G then ${goKey.toUpperCase()}`}>
                      <kbd className="kbd">G</kbd>
                      <kbd className="kbd">{goKey.toUpperCase()}</kbd>
                    </span>
                  )}
                  {selected && <CornerDownLeft size={14} aria-hidden="true" className="hidden sm:block text-content-muted" />}
                </li>
              );
            })}
          </ul>
        )}

        <p className="hidden sm:flex items-center justify-between text-2xs text-content-disabled border-t border-overlay-subtle pt-2.5">
          <span>↑ ↓ to move · Enter to open · Esc to close</span>
          <span>
            <kbd className="kbd">{IS_APPLE_PLATFORM ? '⌘' : 'Ctrl'}</kbd> <kbd className="kbd">K</kbd>
          </span>
        </p>
      </div>
    </Dialog>
  );
}
