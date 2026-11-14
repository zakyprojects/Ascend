import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button, Card, Disclosure, PageColumns, Switch, ToolbarInput } from '@/components/ui/primitives';
import { MasonryGrid } from '@/components/ui/MasonryGrid';
import { DoneSection } from '@/components/projects/DoneSection';
import { SettingRow, SettingsCard } from '@/components/settings/SettingRow';
import { Caption, Section } from './shared';

function DisclosureDemo() {
  return (
    <div className="space-y-3">
      <Disclosure title="The 8+8+8 guide">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Content guides and background reads, not a page's rules (those are in How it works).</li>
          <li>The summary stays on the page; the detail opens on demand.</li>
        </ul>
      </Disclosure>
      <Disclosure title="Missing a habit costs points" icon={AlertTriangle} tone="warning">
        <p>Each missed day in a row costs more than the last, up to a limit.</p>
      </Disclosure>
      <Disclosure title="Opens by default" icon={Info} defaultOpen>
        <p>defaultOpen shows the detail on first render.</p>
      </Disclosure>
    </div>
  );
}

const MASONRY_HEIGHTS = ['h-16', 'h-32', 'h-20', 'h-40', 'h-24', 'h-14', 'h-28'];

function GridCardsDemo() {
  return (
    <div className="space-y-6">
      {(['grid-cards', 'grid-cards-lg', 'grid-cards-xl'] as const).map((name) => (
        <div key={name} className="space-y-1.5">
          <Caption>.{name}</Caption>
          <div className={name}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="card card-hover p-4 text-sm text-content-secondary">
                Card {i + 1}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-1.5">
        <Caption>MasonryGrid minColumnRem=16 (uneven heights pack into columns)</Caption>
        <MasonryGrid minColumnRem={16}>
          {MASONRY_HEIGHTS.map((h, i) => (
            <div key={i} className={`card p-4 text-sm text-content-secondary ${h}`}>
              Card {i + 1}
            </div>
          ))}
        </MasonryGrid>
      </div>
    </div>
  );
}

function PageColumnsDemo() {
  return (
    <PageColumns
      lead={<div className="card p-4 text-sm text-content-secondary">lead (main column, first)</div>}
      aside={<div className="card p-4 text-sm text-content-secondary">aside (side column; between lead and children on narrow screens)</div>}
      footer={<div className="card p-4 text-sm text-content-secondary">footer (full width)</div>}
    >
      <div className="card p-4 text-sm text-content-secondary">children (main column, after)</div>
    </PageColumns>
  );
}

const DONE_TASKS = ['Write the project brief', 'Set up the repo', 'Pick a colour palette'];

function DoneSectionDemo() {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const done = DONE_TASKS.filter((t) => !q || t.toLowerCase().includes(q));
  return (
    <div className="space-y-3">
      <ToolbarInput type="search" aria-label="Search tasks" placeholder="Type to hold Done open" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="card p-4 text-sm text-content-secondary">Ship the landing page (to do)</div>
      <DoneSection label="Done" count={done.length} forceOpen={q.length > 0}>
        <ul className="space-y-2">
          {done.map((t) => (
            <li key={t} className="card p-3 text-sm text-content-muted line-through">
              {t}
            </li>
          ))}
        </ul>
      </DoneSection>
    </div>
  );
}

function SettingRowDemo() {
  const [reminders, setReminders] = useState(true);
  const [sounds, setSounds] = useState(false);
  return (
    <div className="max-w-xl">
      <SettingsCard title="Notifications">
        <div className="divide-y divide-overlay-subtle">
          <SettingRow
            title="Evening reminder"
            description="A nudge at 9 pm if today still has habits left."
            control={<Switch checked={reminders} onChange={() => setReminders((v) => !v)} label="Evening reminder" />}
          />
          <SettingRow
            title="Tick sounds"
            description="A short sound when you tick a habit off."
            control={<Switch checked={sounds} onChange={() => setSounds((v) => !v)} label="Tick sounds" />}
          />
          <SettingRow title="Test notification" description="Sends one to this device." control={<Button size="sm" variant="secondary">Send</Button>} />
          <SettingRow title="A setting with only a description" description="No control on the right: the text takes the full width." />
        </div>
      </SettingsCard>
    </div>
  );
}

export function LayoutGroup() {
  const [cardClicks, setCardClicks] = useState<number>(0);
  return (
    <>
      <Section id="cards">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card variant="default">
              <p className="text-sm text-content-primary">Variant: default</p>
            </Card>
            <Card variant="subtle">
              <p className="text-sm text-content-primary">Variant: subtle</p>
            </Card>
            <Card variant="interactive" onClick={() => setCardClicks((c) => c + 1)}>
              <p className="text-sm text-content-primary">Variant: interactive (clicked {cardClicks} times)</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card padding="none" className="border border-dashed border-overlay-default">
              <p className="text-sm text-content-primary">padding="none"</p>
            </Card>
            <Card padding="sm">
              <p className="text-sm text-content-primary">padding="sm"</p>
            </Card>
            <Card padding="md">
              <p className="text-sm text-content-primary">padding="md"</p>
            </Card>
            <Card padding="lg">
              <p className="text-sm text-content-primary">padding="lg"</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card card-hover p-4">
              <p className="text-sm text-content-primary">.card.card-hover: lifts under the pointer (no lift on touch)</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-content-primary">.card (no hover)</p>
            </div>
          </div>

          <Card as="section">
            <p className="text-sm text-content-primary">Card as="section"</p>
            <div className="card mt-3 p-3">
              <p className="text-sm text-content-secondary">A card inside a card flattens (no second border box).</p>
            </div>
          </Card>

          <ul className="space-y-2">
            {[1, 2, 3].map((n) => (
              <Card key={n} as="li">
                <span className="text-sm text-content-primary">Card as="li" (item {n})</span>
              </Card>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="grid-cards">
        <GridCardsDemo />
      </Section>

      <Section id="page-columns">
        <PageColumnsDemo />
      </Section>

      <Section id="disclosure">
        <DisclosureDemo />
      </Section>

      <Section id="done-section">
        <DoneSectionDemo />
      </Section>

      <Section id="setting-row">
        <SettingRowDemo />
      </Section>
    </>
  );
}
