import { useEffect, useRef, useState } from 'react';
import { Bell, Eye, Info, KeyRound, Palette, User, type LucideIcon } from 'lucide-react';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { cx, FOCUS_RING, TabPanel, Tabs } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Motion';
import { confirmLeave } from '@/lib/unsavedChanges';
import {
  clearPendingSettingsSection,
  initialSettingsSection,
  isSettingsSection,
  SETTINGS_SECTION_EVENT,
  settingsSectionPath,
  type SettingsSection,
} from '@/lib/settingsSections';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AccountSection } from '@/components/settings/AccountSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { AboutSection, AppearanceSection, PrivacySection } from '@/components/settings/PreferenceSections';

interface SettingsViewProps {
  store: AppStore;
  onOpenAuth?: () => void;
  /** Opens another page (the Help links under About). */
  onNavigate: (view: View) => void;
}

const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: KeyRound },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: Eye },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'about', label: 'About', icon: Info },
];
const SECTION_IDS = SECTIONS.map(({ id }) => id);

export function SettingsView({ store, onOpenAuth, onNavigate }: SettingsViewProps) {
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);

  // The section lives in the address (`?section=notifications`): reload keeps it and other
  // screens can open it directly (D-S2). It replaces the entry, so Back still leaves Settings.
  const [section, setSection] = useState<SettingsSection>(initialSettingsSection);
  // Another section unmounts this one's form: unsaved typing asks "Discard changes?" first.
  const openSection = (next: SettingsSection) => {
    if (next !== section) confirmLeave(() => setSection(next));
  };
  const changeSection = (id: string) => isSettingsSection(id) && openSection(id);

  useEffect(() => {
    const path = settingsSectionPath(section);
    if (window.location.pathname + window.location.search !== path) {
      window.history.replaceState(window.history.state, '', path);
    }
  }, [section]);

  // Asked for while Settings is already open (the notifications panel's settings link): the same
  // "Discard changes?" guard as a tap on the section list.
  const sectionRef = useRef(section);
  sectionRef.current = section;
  useEffect(() => {
    const onRequest = (event: Event) => {
      const next = (event as CustomEvent).detail;
      if (isSettingsSection(next)) {
        clearPendingSettingsSection();
        if (next !== sectionRef.current) confirmLeave(() => setSection(next));
      }
    };
    window.addEventListener(SETTINGS_SECTION_EVENT, onRequest);
    return () => window.removeEventListener(SETTINGS_SECTION_EVENT, onRequest);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Your profile, notifications and account.</p>
      </div>

      {isGuest && (
        <GuestSaveBanner
          title={`Guest account (${currentUser?.username})`}
          description="Create an account to keep your habits and points."
          onCreateAccount={onOpenAuth}
        />
      )}

      <div className="flex flex-col gap-5 sm:grid sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:items-start">
        {/* Phones: a scrollable tab strip. */}
        <Tabs
          idBase="settings"
          className="sm:hidden"
          items={SECTIONS.map(({ id, label }) => ({ id, label }))}
          value={section}
          onChange={changeSection}
          variant="underline"
          size="sm"
          scrollable
          ariaLabel="Settings sections"
        />

        {/* Tablet and up: the section list beside the content. */}
        <nav aria-label="Settings sections" className="hidden sm:block sm:sticky sm:top-4">
          <ul className="space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <li key={id}>
                  <a
                    href={settingsSectionPath(id)}
                    aria-current={active ? 'true' : undefined}
                    onClick={(event) => {
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      openSection(id);
                    }}
                    className={cx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-500/15 text-brand-text'
                        : 'text-content-muted hover:bg-overlay-subtle hover:text-content-secondary',
                      FOCUS_RING
                    )}
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Phones swipe between sections (the strip above); from sm up the strip is hidden and so is the swipe. */}
        <TabPanel idBase="settings" ids={SECTION_IDS} value={section} onChange={changeSection} className="min-w-0">
          <Reveal key={section} index={0} className="min-w-0">
            {section === 'profile' && <ProfileSection store={store} />}
            {section === 'account' && <AccountSection store={store} onOpenAuth={onOpenAuth} />}
            {section === 'notifications' && <NotificationsSection store={store} />}
            {section === 'privacy' && <PrivacySection store={store} />}
            {section === 'appearance' && <AppearanceSection store={store} />}
            {section === 'about' && <AboutSection onNavigate={onNavigate} />}
          </Reveal>
        </TabPanel>
      </div>
    </div>
  );
}
