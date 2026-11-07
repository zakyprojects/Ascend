import { useState } from 'react';
import { Sparkline } from '@/components/ui/charts';
import { Bell, HelpCircle, Lock, Palette, Settings, User, Volume2 } from 'lucide-react';
import { Button, Input, NavItem, NavSection, StaticTabPanel, TabPanel, Tabs, Textarea, type TabItem } from '@/components/ui/primitives';
import { DEFAULT_GROUP_VIEWS, NAV_DASHBOARD, NAV_GROUPS, getGroupForView, type NavGroup } from '@/components/nav/navConfig';
import { Sidebar, type AccountPlacement } from '@/components/nav/Sidebar';
import { MobileZoneBar } from '@/components/nav/MobileZoneBar';
import { ZoneSheet } from '@/components/nav/ZoneSheet';
import { AccountMenu } from '@/components/nav/AccountMenu';
import { CommandPalette } from '@/components/nav/CommandPalette';
import { NotificationCenter } from '@/components/ui/NotificationCenter';
import { RankChip } from '@/components/ui/RankChip';
import { useToast } from '@/components/ui/Toast';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import type { View } from '@/lib/views';
import { useGalleryTheme } from './util';
import { useFakeNotificationStore } from './fakes';
import type { NavStatuses } from '@/lib/navStatus';
import { Caption, Section } from './shared';
import { CHART_TREND } from './fixtures';

// Real tab labels: PFC's four tabs, and Settings' eight (too wide for a phone, so it scrolls).
const setA: TabItem[] = [
  { id: 'a1', label: 'Focus' },
  { id: 'a2', label: 'Schedule' },
  { id: 'a3', label: 'Decisions' },
  { id: 'a4', label: 'Emotions' },
];

const setB: TabItem[] = [
  { id: 'b1', label: 'Profile', icon: User },
  { id: 'b2', label: 'Appearance', icon: Palette },
  { id: 'b3', label: 'Sound & vibration', icon: Volume2 },
  { id: 'b4', label: 'Notifications', icon: Bell, badge: 3 },
  { id: 'b5', label: 'Privacy', icon: Lock },
  { id: 'b6', label: 'Account' },
  { id: 'b7', label: 'Support us', badge: 12 },
  { id: 'b8', label: 'About us' },
];

/** StaticTabPanel: the tab body for a strip whose panels don't swipe (Leagues Weekly, Monthly, Season). */
const LEAGUE_TABS: TabItem[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'ninetyDay', label: 'Season' },
];

function StaticTabsDemo() {
  const [tab, setTab] = useState('weekly');
  return (
    <div className="space-y-3">
      <Tabs idBase="gallery-static" ariaLabel="Leagues" items={LEAGUE_TABS} value={tab} onChange={setTab} />
      <StaticTabPanel idBase="gallery-static" value={tab} className="card p-4 text-sm text-content-secondary">
        {LEAGUE_TABS.find((t) => t.id === tab)?.label} board (StaticTabPanel: role tabpanel, labelled by its tab, no swipe)
      </StaticTabPanel>
    </div>
  );
}

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

// Fake today's status marks and badges for a few pages; the groups and pages come from navConfig.
const DEMO_STATUSES: NavStatuses = {
  habits: { tone: 'pending', meta: '2 left', label: '2 habits left today' },
  exercise: { tone: 'done', label: 'Done today' },
  'bad-habits': { tone: 'risk', meta: 'report', label: 'Report today before the day closes' },
  neuroplasticity: { tone: 'risk', meta: '1 left', label: 'Day closes soon' },
  'weekly-goals': { tone: 'pending', meta: '3/5', label: '3 of 5 goals done' },
};
const DEMO_BADGES: Partial<Record<View, number>> = { partner: 2 };

/** The trail rows and foldable group headers, built from NAV_GROUPS so the demo can't drift. */
function NavPartsDemo() {
  const [active, setActive] = useState<View>('dashboard');
  const [closed, setClosed] = useState<string[]>([]);
  const [rowActive, setRowActive] = useState('Settings');

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Caption>NavItem trail + NavSection from NAV_GROUPS (status marks, badge, fold)</Caption>
        <div className="w-[256px] max-w-full rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          <NavItem
            icon={NAV_DASHBOARD.icon}
            label={NAV_DASHBOARD.label}
            layout="trail"
            active={active === NAV_DASHBOARD.id}
            onClick={() => setActive(NAV_DASHBOARD.id)}
          />
          {NAV_GROUPS.map((group) => {
            const open = !closed.includes(group.id);
            const listId = `gallery-nav-${group.id}`;
            return (
              <div key={group.id} className="mt-3">
                <NavSection
                  label={group.label}
                  expanded={open}
                  onToggle={() => setClosed((c) => (c.includes(group.id) ? c.filter((id) => id !== group.id) : [...c, group.id]))}
                  controlsId={listId}
                  badgeCount={group.items.reduce((n, item) => n + (DEMO_BADGES[item.id] ?? 0), 0)}
                />
                {open && (
                  <div id={listId} className="space-y-px">
                    {group.items.map((item) => (
                      <NavItem
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        layout="trail"
                        status={DEMO_STATUSES[item.id]}
                        badgeCount={DEMO_BADGES[item.id]}
                        active={active === item.id}
                        onClick={() => setActive(item.id)}
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

const DEMO_USER = { name: 'zakria', avatar: '🦅', isGuest: false };

/** AccountMenu with a fake user; Log out opens nothing here (the real one asks LogoutConfirmModal). */
function DemoAccountMenu({ placement, currentView, onOpenView }: { placement: AccountPlacement; currentView: View; onOpenView: (view: View) => void }) {
  const theme = useGalleryTheme();
  const { showInfoToast } = useToast();
  return (
    <AccountMenu
      placement={placement}
      user={DEMO_USER}
      settingsActive={currentView === 'settings'}
      isDark={theme === 'dark'}
      onToggleTheme={() => document.querySelector<HTMLButtonElement>('header [aria-label$="theme"]')?.click()}
      onOpenSettings={() => onOpenView('settings')}
      currentView={currentView}
      onOpenView={onOpenView}
      onOpenAuth={() => showInfoToast('Sign in', 'The Gallery never opens the sign-in page.')}
      onLogout={() => showInfoToast('Log out', 'The app asks first (Dialogs & overlays › Logout).')}
    />
  );
}

/** The real desktop Sidebar with fake statuses, bell (in-memory notices), standing and account. */
function SidebarDemo() {
  const [view, setView] = useState<View>('habits');
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { showInfoToast } = useToast();
  const notices = useFakeNotificationStore();
  return (
    <div className="space-y-2">
      <div style={{ height: 640 }} className="max-w-full overflow-hidden rounded-xl border border-overlay-subtle bg-bg-900">
        <Sidebar
          currentView={view}
          activeGroup={getGroupForView(view)}
          statuses={DEMO_STATUSES}
          partnerBadge={2}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onNavigate={setView}
          onSearch={() => setPaletteOpen(true)}
          onQuickLog={() => showInfoToast('Quick log', 'Not in the Gallery: it logs to the real store.')}
          bell={<NotificationCenter store={notices.store} compact align="sidebar" />}
          standing={<RankChip seasonPoints={1840} />}
          renderAccount={(placement) => <DemoAccountMenu placement={placement} currentView={view} onOpenView={setView} />}
        />
      </div>
      <p className="text-micro text-content-muted">
        On: {view}. Folded groups are saved under ascend_nav_closed_groups, like the app. Search opens the command palette.
      </p>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} currentView={view} onViewChange={setView} />
    </div>
  );
}

/** Phone bottom bar + zone sheet. The bar is lg:hidden, so narrow the window below 1024px to see it. */
function MobileNavDemo() {
  const [view, setView] = useState<View>('habits');
  const [sheetOpen, setSheetOpen] = useState(false);
  const zone = getGroupForView(view);
  const zoneViews = { ...DEFAULT_GROUP_VIEWS, ...(zone ? { [zone]: view } : {}) } as Record<NavGroup['id'], View>;
  return (
    <div className="space-y-2">
      {/* transform makes the bar's fixed position sit inside this frame */}
      <div style={{ height: 120, maxWidth: 390, borderRadius: 28 }} className="relative mx-auto overflow-hidden border border-overlay-default bg-bg-900 [transform:translateZ(0)]">
        <p className="p-4 text-xs text-content-muted">Page: {view}</p>
        <MobileZoneBar
          onDashboard={view === 'dashboard'}
          activeZone={zone}
          playBadge={2}
          sheetOpen={sheetOpen}
          zoneViews={zoneViews}
          onGoDashboard={() => setView('dashboard')}
          onZone={(next) => {
            if (next === zone) setSheetOpen(true);
            else setView(zoneViews[next]);
          }}
        />
      </div>
      <p className="hidden text-micro text-content-muted lg:block">The bar hides from 1024px (lg), as in the app: make the window narrower.</p>
      <ZoneSheet
        open={sheetOpen}
        group={NAV_GROUPS.find((g) => g.id === zone)}
        currentView={view}
        statuses={DEMO_STATUSES}
        partnerBadge={2}
        onNavigate={(next) => {
          setView(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

function CommandPaletteDemo() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Open command palette
      </Button>
      <span className="text-xs text-content-muted">
        In the app: <kbd className="kbd">{IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K'}</kbd>. Picked: {view}
      </span>
      <CommandPalette open={open} onOpenChange={setOpen} currentView={view} onViewChange={setView} />
    </div>
  );
}

export function NavigationGroup() {
  return (
    <>
      <Section id="sidebar">
        <SidebarDemo />
      </Section>

      <Section id="navigation">
        <NavPartsDemo />
      </Section>

      <Section id="mobile-nav">
        <MobileNavDemo />
      </Section>

      <Section id="account-menu">
        <div className="flex items-center gap-4">
          <DemoAccountMenu placement="below" currentView="dashboard" onOpenView={() => undefined} />
          <span className="text-xs text-content-muted">Tap the avatar. Fake user; theme toggles the Gallery theme.</span>
        </div>
      </Section>

      <Section id="command-palette">
        <CommandPaletteDemo />
      </Section>

      <Section id="tabs">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsDemo />
        </div>
      </Section>

      <Section id="static-tabs">
        <StaticTabsDemo />
      </Section>

      <Section id="tab-swipe">
        <TabSwipeDemo />
      </Section>
    </>
  );
}
