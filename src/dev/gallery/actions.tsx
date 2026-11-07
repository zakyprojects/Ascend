import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, SlidingPill, Switch, cx } from '@/components/ui/primitives';
import { Caption, Section } from './shared';
import { wait } from './util';

const buttonVariants: Array<'primary' | 'secondary' | 'ghost' | 'danger'> = [
  'primary',
  'secondary',
  'ghost',
  'danger',
];

// The CSS button classes in index.css; dialog footers and many pages still use them directly.
const BUTTON_CLASSES = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-danger-solid'];

function SwitchDemo() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOn, setSavingOn] = useState(false);
  const rows: Array<{ title: string; control: React.ReactNode }> = [
    { title: 'On', control: <Switch checked={on} onChange={() => setOn((v) => !v)} label="On" /> },
    { title: 'Off', control: <Switch checked={off} onChange={() => setOff((v) => !v)} label="Off" /> },
    { title: 'Disabled', control: <Switch checked={false} onChange={() => undefined} disabled label="Disabled" /> },
    {
      title: 'Saves for a second (loading)',
      control: (
        <Switch
          checked={savingOn}
          loading={saving}
          onChange={async () => {
            setSaving(true);
            await wait(1000);
            setSavingOn((v) => !v);
            setSaving(false);
          }}
          label="Saves for a second"
        />
      ),
    },
  ];
  return (
    <div className="divide-y divide-overlay-subtle rounded-xl border border-overlay-subtle">
      {rows.map((row) => (
        <div key={row.title} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm font-medium text-content-secondary">{row.title}</span>
          {row.control}
        </div>
      ))}
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
  { id: 'archived', label: 'Archived (12)' },
];

/** Hand-built option rows with SlidingPill (the moving active background). */
function SegmentedDemo() {
  const [fill, setFill] = useState('all');
  const [line, setLine] = useState('active');
  const [mode, setMode] = useState('add');
  const option = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      type="button"
      data-pill-id={id}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Caption>Filter row, fill (neutral active, wraps on phones)</Caption>
        <div role="group" aria-label="Filter" className="relative isolate flex flex-wrap items-center gap-1.5">
          <SlidingPill active={fill} className="rounded-lg border border-overlay-strong bg-overlay-default" />
          {FILTERS.map((f) => option(f.id, f.label, fill === f.id, () => setFill(f.id)))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Caption>Underline variant</Caption>
        <div role="group" aria-label="Filter underline" className="relative isolate flex flex-wrap items-center gap-1.5 border-b border-overlay-subtle">
          <SlidingPill active={line} variant="underline" className="bg-primary-500" />
          {FILTERS.map((f) => option(f.id, f.label, line === f.id, () => setLine(f.id)))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Caption>Two-way switch in a track (as in Update progress)</Caption>
        <div className="relative isolate grid max-w-xs grid-cols-2 gap-1 rounded-xl border border-overlay-default bg-bg-700 p-1">
          <SlidingPill active={mode} className="rounded-lg bg-primary-500/15 border border-primary-500/40" />
          {[
            { id: 'add', label: 'Add' },
            { id: 'set', label: 'Set total' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              data-pill-id={m.id}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                mode === m.id ? 'text-brand-text' : 'text-content-muted hover:text-content-secondary'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ActionsGroup() {
  return (
    <>
      <Section id="buttons">
        <div className="space-y-6">
          {buttonVariants.map((variant) => (
            <div key={variant} className="space-y-1.5">
              <Caption>{variant}</Caption>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={variant} size="sm">
                  sm default
                </Button>
                <Button variant={variant} size="sm" disabled>
                  sm disabled
                </Button>
                <Button variant={variant} size="sm" loading>
                  sm loading
                </Button>
                <Button variant={variant} size="md">
                  md default
                </Button>
                <Button variant={variant} size="md" disabled>
                  md disabled
                </Button>
                <Button variant={variant} size="md" loading>
                  md loading
                </Button>
                <Button variant={variant} size="icon" aria-label="Add">
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-4 pt-4 border-t border-overlay-subtle">
            <div className="w-[280px] max-w-full">
              <Button fullWidth>fullWidth in w-[280px]</Button>
            </div>
            <div className="w-[200px]">
              <Button>Very long button label that overflows container</Button>
            </div>
          </div>
        </div>
      </Section>

      <Section id="button-classes">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {BUTTON_CLASSES.map((name) => (
              <button key={name} type="button" className={name}>
                .{name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {BUTTON_CLASSES.map((name) => (
              <button key={name} type="button" className={name} disabled>
                disabled
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary">
              <Plus size={16} aria-hidden="true" />
              Icon + text
            </button>
            <button type="button" className="btn-secondary text-xs">
              <Plus size={14} aria-hidden="true" />
              text-xs
            </button>
          </div>
        </div>
      </Section>

      <Section id="switch">
        <SwitchDemo />
      </Section>

      <Section id="segmented">
        <SegmentedDemo />
      </Section>
    </>
  );
}
