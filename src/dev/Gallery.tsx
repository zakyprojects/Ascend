import React, { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { applyTheme, setLocalThemePreference } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/Toast';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import { GALLERY_GROUPS } from './gallery/registry';
import { GalleryThemeContext } from './gallery/util';
import { FoundationsGroup } from './gallery/foundations';
import { ActionsGroup } from './gallery/actions';
import { FormsGroup } from './gallery/forms';
import { LayoutGroup } from './gallery/layout';
import { PagePartsGroup } from './gallery/pageparts';
import { NavigationGroup } from './gallery/navigation';
import { DialogsGroup } from './gallery/dialogs';
import { FeedbackGroup } from './gallery/feedback';
import { ListsGroup } from './gallery/lists';
import { LeaguesGroup } from './gallery/leagues';
import { ChartsGroup } from './gallery/charts';
import { AuthGroup } from './gallery/auth';
import { DockGroup } from './gallery/dock';
import { DashboardGroup } from './gallery/dashboard';
import { ExcludedGroup } from './gallery/excluded';

// Classes: Tailwind scans src/dev too, so a utility used only here ships in the prod CSS. Use classes the
// app already uses, or inline styles (as below), so the prod bundle stays byte-for-byte the same.
const SCROLL_MARGIN = { scrollMarginTop: '7rem' } as const;

// Dev-only test bed for the real UI components with fake data (no store, no Supabase).
// Reached only through main.tsx's `import.meta.env.DEV && ?gallery` dynamic import, so nothing
// under src/dev is ever in a production build. Never import src/dev from app code.

const GROUP_CONTENT: Record<string, React.ComponentType> = {
  foundations: FoundationsGroup,
  actions: ActionsGroup,
  forms: FormsGroup,
  layout: LayoutGroup,
  pageparts: PagePartsGroup,
  navigation: NavigationGroup,
  dialogs: DialogsGroup,
  feedback: FeedbackGroup,
  lists: ListsGroup,
  leagues: LeaguesGroup,
  dock: DockGroup,
  dashboard: DashboardGroup,
  charts: ChartsGroup,
  auth: AuthGroup,
  excluded: ExcludedGroup,
};

/** Every section, grouped, as anchor links (deep links like /?gallery#member-card). */
function GalleryIndex() {
  return (
    <nav aria-label="Gallery sections" className="card p-4 sm:p-6">
      <h2 className="section-title">Sections</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-6 lg:grid-cols-4" style={{ rowGap: '1rem' }}>
        {GALLERY_GROUPS.map((group) => (
          <div key={group.id} className="min-w-0">
            <a href={`#group-${group.id}`} className="stat-label hover:underline">
              {group.label}
            </a>
            <ul className="mt-1 space-y-0.5">
              {group.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-xs text-content-secondary hover:text-content-primary hover:underline">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function GalleryContent() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  );

  const [bodyOverflow, setBodyOverflow] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      return document.body.style.overflow || '""';
    }
    return '""';
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setBodyOverflow(document.body.style.overflow || '""');
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // The page renders after the browser's own jump to the hash, so a deep link scrolls here.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, []);

  // ThemeToggle runs this inside the app's reveal transition (lib/themeTransition).
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setLocalThemePreference(next);
    setTheme(next);
  };

  return (
    <GalleryThemeContext.Provider value={theme}>
      <div className="min-h-screen text-content-secondary">
        <div aria-hidden="true" className="app-atmosphere" />
        {/* Top bar: stays on screen; the group row scrolls sideways inside itself on phones. */}
        <header className="glass sticky top-0 z-30 border-b border-overlay-subtle">
          <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h1 className="text-base font-semibold text-content-primary sm:text-lg">AscendDay UI gallery (dev only)</h1>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-content-muted">body overflow: {bodyOverflow}</span>
                <ThemeToggle isDark={theme === 'dark'} onToggle={toggleTheme} />
              </div>
            </div>
            <nav aria-label="Gallery groups" className="scroll-fade mt-2 overflow-x-auto pb-2">
              <ul className="flex gap-1.5" style={{ width: 'max-content' }}>
                {GALLERY_GROUPS.map((group) => (
                  <li key={group.id}>
                    <a
                      href={`#group-${group.id}`}
                      className="block whitespace-nowrap rounded-full border border-overlay-default px-3 py-1 text-xs text-content-secondary hover:bg-overlay-subtle hover:text-content-primary"
                    >
                      {group.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-10 p-4 sm:p-8">
          <p className="text-xs text-content-muted">
            Fake data only: no store, no Supabase writes. Theme, sound, sidebar and dock-pill choices here are saved in this
            browser like the app saves them. Reduced motion follows the device setting (DevTools › Rendering).
          </p>
          <GalleryIndex />

          {GALLERY_GROUPS.map((group) => {
            const Content = GROUP_CONTENT[group.id];
            if (!Content) return null;
            return (
              <section key={group.id} id={`group-${group.id}`} aria-labelledby={`group-${group.id}-title`} className="space-y-6" style={SCROLL_MARGIN}>
                <h2 id={`group-${group.id}-title`} className="page-title">
                  {group.label}
                </h2>
                <Content />
              </section>
            );
          })}

          <footer className="pt-6 text-micro text-content-muted">ascend-dev-gallery-sentinel-7f3k9q-zx81-do-not-ship</footer>
        </main>
        {/* The app renders this once in App; the gallery needs its own for the dialog guard. */}
        <DiscardChangesDialog />
      </div>
    </GalleryThemeContext.Provider>
  );
}

export function Gallery() {
  return (
    <ToastProvider>
      <GalleryContent />
    </ToastProvider>
  );
}
