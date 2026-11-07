import { useState } from 'react';
import { Sparkline } from '@/components/ui/charts';
import { Home, Target, BookOpen, Activity, Zap, Brain, Clock, Trophy, Settings, HelpCircle } from 'lucide-react';
import { Button, Input, NavItem, NavSection, TabPanel, Tabs, Textarea, type TabItem } from '@/components/ui/primitives';
import type { NavStatus } from '@/lib/navStatus';
import { Caption, Section } from './shared';
import { CHART_TREND } from './fixtures';

const setA: TabItem[] = [
  { id: 'a1', label: 'Overview' },
  { id: 'a2', label: 'Activity' },
  { id: 'a3', label: 'Stats' },
  { id: 'a4', label: 'Settings' },
];

const setB: TabItem[] = [
  { id: 'b1', label: 'Habits', icon: Zap },
  { id: 'b2', label: 'Bad Habits', icon: Target, badge: 3 },
  { id: 'b3', label: 'Exercise', icon: Activity },
  { id: 'b4', label: 'Reading', icon: BookOpen },
  { id: 'b5', label: 'Skills', icon: Brain },
  { id: 'b6', label: 'Time' },
  { id: 'b7', label: 'Weekly', badge: 12 },
  { id: 'b8', label: 'Projects' },
  { id: 'b9', label: 'Journal' },
  { id: 'b10', label: 'Plans' },
];

function TabsDemo() {
  const [tab1, setTab1] = useState('a1');
  const [tab2, setTab2] = useState('a1');
  const [tab3, setTab3] = useState('a1');
  const [tab4, setTab4] = useState('b1');
  const [tab5, setTab5] = useState('b1');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented md</p>
        <Tabs
          ariaLabel="Segmented md tabs"
          variant="segmented"
          size="md"
          items={setA}
          value={tab1}
          onChange={setTab1}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">underline md</p>
        <Tabs
          ariaLabel="Underline md tabs"
          variant="underline"
          size="md"
          items={setA}
          value={tab2}
          onChange={setTab2}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented sm</p>
        <Tabs
          ariaLabel="Segmented sm tabs"
          variant="segmented"
          size="sm"
          items={setA}
          value={tab3}
          onChange={setTab3}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented md scrollable</p>
        <div className="w-[320px]">
          <Tabs
            ariaLabel="Segmented md scrollable tabs"
            variant="segmented"
            size="md"
            scrollable
            items={setB}
            value={tab4}
            onChange={setTab4}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">underline md scrollable</p>
        <div className="w-[320px]">
          <Tabs
            ariaLabel="Underline md scrollable tabs"
            variant="underline"
            size="md"
            scrollable
            items={setB}
            value={tab5}
            onChange={setTab5}
          />
        </div>
      </div>
    </div>
  );
}

const SWIPE_TABS: TabItem[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'long', label: 'Long list' },
  { id: 'form', label: 'Form' },
];

// Tab swipe test bed (lib/useTabSwipe): a chart that scrubs, a long panel with buttons, text fields.
function TabSwipeDemo() {
  const [tab, setTab] = useState('chart');
  const [presses, setPresses] = useState(0);
  const ids = SWIPE_TABS.map((t) => t.id);

  return (
    <div className="space-y-4">
      <Tabs idBase="gallery-swipe" ariaLabel="Swipe demo" size="sm" scrollable items={SWIPE_TABS} value={tab} onChange={setTab} />
      <TabPanel idBase="gallery-swipe" ids={ids} value={tab} onChange={setTab} className="space-y-3">
        {tab === 'chart' && (
          <div className="card p-4 space-y-2">
            <p className="text-sm text-content-secondary">Swipe here to change tab; scrubbing the chart must not.</p>
            <Sparkline points={CHART_TREND} label="Points, last 14 days" />
          </div>
        )}
        {tab === 'long' &&
          Array.from({ length: 30 }, (_, i) => (
            <div key={i} className="card p-4 flex items-center justify-between">
              <span className="text-sm text-content-secondary">Row {i + 1}</span>
              <Button size="sm" variant="secondary" onClick={() => setPresses((n) => n + 1)}>
                Press ({presses})
              </Button>
            </div>
          ))}
        {tab === 'form' && (
          <div className="card p-4 space-y-3">
            <Input label="Name" placeholder="Dragging in here selects text" />
            <Textarea label="Note" placeholder="Swipes starting here never change tab" />
          </div>
        )}
      </TabPanel>
    </div>
  );
}

const NAV_DEMO_GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ label: string; icon: typeof Home; status?: NavStatus; badge?: number }>;
}> = [
  {
    id: 'track',
    label: 'Track',
    items: [
      { label: 'Habits', icon: Target, status: { tone: 'pending', meta: '2 left', label: '2 habits left today' } },
      { label: 'Exercise', icon: Activity, status: { tone: 'done', label: 'Done today' } },
      { label: 'Skills', icon: Zap },
    ],
  },
  {
    id: 'mind',
    label: 'Mind',
    items: [
      { label: 'Neuro', icon: Brain, status: { tone: 'risk', meta: '1 left', label: 'Day closes soon' } },
      { label: 'Journal', icon: BookOpen },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    items: [
      { label: 'Leagues', icon: Trophy },
      { label: 'Partner', icon: Clock, badge: 2 },
    ],
  },
];

/** The desktop sidebar's parts: trail rows with today's status, foldable group headers. */
function NavDemo() {
  const [active, setActive] = useState('Dashboard');
  const [closed, setClosed] = useState<string[]>([]);
  const [rowActive, setRowActive] = useState('Settings');

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Caption>Sidebar (layout trail, foldable sections, status marks)</Caption>
        <div className="w-[256px] max-w-full rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          <NavItem icon={Home} label="Dashboard" layout="trail" active={active === 'Dashboard'} onClick={() => setActive('Dashboard')} />
          {NAV_DEMO_GROUPS.map((group) => {
            const open = !closed.includes(group.id);
            const listId = `gallery-nav-${group.id}`;
            return (
              <div key={group.id} className="mt-3">
                <NavSection
                  label={group.label}
                  expanded={open}
                  onToggle={() => setClosed((c) => (c.includes(group.id) ? c.filter((id) => id !== group.id) : [...c, group.id]))}
                  controlsId={listId}
                  badgeCount={group.items.reduce((n, item) => n + (item.badge ?? 0), 0)}
                />
                {open && (
                  <div id={listId} className="space-y-px">
                    {group.items.map((item) => (
                      <NavItem
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        layout="trail"
                        status={item.status}
                        badgeCount={item.badge}
                        active={active === item.label}
                        onClick={() => setActive(item.label)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Row layout (account menu)</Caption>
        <div className="w-[256px] max-w-full space-y-1 rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          {[
            { label: 'Settings', icon: Settings },
            { label: 'Help', icon: HelpCircle },
          ].map((item) => (
            <NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              layout="row"
              active={rowActive === item.label}
              onClick={() => setRowActive(item.label)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function NavigationGroup() {
  return (
    <>
      <Section id="navigation">
        <NavDemo />
      </Section>

      <Section id="tabs">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsDemo />
        </div>
      </Section>

      <Section id="tab-swipe">
        <TabSwipeDemo />
      </Section>
    </>
  );
}
