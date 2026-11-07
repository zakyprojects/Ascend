// The Gallery index: every group and section, in page order. Sections read their title and note
// from here, so the index can never list a section the page does not have under another name.

export interface GallerySectionInfo {
  id: string;
  title: string;
  /** One plain line under the title: what the section checks. */
  note?: string;
}

export interface GalleryGroupInfo {
  id: string;
  label: string;
  sections: GallerySectionInfo[];
}

export const GALLERY_GROUPS: GalleryGroupInfo[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    sections: [
      { id: 'typography', title: 'Typography', note: 'Geist everywhere; serif and mono only where the rules allow.' },
      { id: 'badges', title: 'Colour & badges', note: 'Badge tones × sizes × shapes, and the CSS .badge-* classes pages use directly (season, beta).' },
      { id: 'brand', title: 'Brand', note: 'The Streak: every logo, icon and loader in the app. Toggle the theme to check both.' },
      { id: 'numbers', title: 'Numbers', note: 'compactNumber (lib/numberFormat): full below 10,000, then at most one decimal (member card numbers).' },
      { id: 'css-patterns', title: 'CSS patterns', note: 'Shared classes in index.css with no component of their own.' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    sections: [
      { id: 'buttons', title: 'Buttons', note: 'The Button primitive: variants, sizes, disabled and loading.' },
      { id: 'button-classes', title: 'Button classes', note: 'The .btn-* classes in index.css, used by dialog footers, page headers and many pages. Solid destructive confirms use .btn-danger-solid; .btn-danger is the soft one.' },
      { id: 'switch', title: 'Switch' },
      { id: 'segmented', title: 'Segmented and filter rows', note: 'SlidingPill glides the active background; active is neutral.' },
    ],
  },
  {
    id: 'forms',
    label: 'Forms',
    sections: [
      { id: 'fields', title: 'Fields', note: 'Input, Select, Textarea, NumberField, FieldRow (two columns from sm), optional marker, hint, error.' },
      { id: 'dropdowns', title: 'Dropdowns', note: "Select (field), ToolbarSelect, StatusSelect: the app's own list, never the browser's picker. Keyboard: arrows, Home/End, letters, Enter/Space, Esc, Tab." },
      { id: 'toolbar-row', title: 'Toolbar row', note: 'ToolbarInput (list search) next to ToolbarSelect filters, as on Projects & Goals and Reading.' },
      { id: 'form-errors', title: 'Form errors', note: 'One problem at a time as a bubble under its field; the field is focused and scrolled to. Press Save with everything empty.' },
    ],
  },
  {
    id: 'layout',
    label: 'Containers & layout',
    sections: [
      { id: 'cards', title: 'Cards', note: 'Card variants and paddings, .card-hover lift (pointer only), nested cards flatten.' },
      { id: 'grid-cards', title: 'Grid cards & MasonryGrid', note: 'The two card layouts: .grid-cards / -lg / -xl (equal rows) and MasonryGrid (columns of uneven cards).' },
      { id: 'page-columns', title: 'PageColumns', note: 'One column below 1440px, main + side column from 1440px.' },
      { id: 'disclosure', title: 'Disclosure' },
      { id: 'done-section', title: 'Done section', note: 'Finished items fold under a closed Done row (Projects & Goals); a search holds it open.' },
      { id: 'setting-row', title: 'Setting row', note: 'SettingsCard + SettingRow: title, description, control on the right.' },
    ],
  },
  {
    id: 'pageparts',
    label: 'Page parts',
    sections: [
      { id: 'page-parts', title: 'Page header & hero', note: 'Fake numbers; the real pages pass store values.' },
      { id: 'how-it-works', title: 'How it works', note: "Button under the page subtitle; the CapMeter's How points work opens the same dialog at Points. Never opens on its own." },
      { id: 'progress', title: 'Progress', note: 'ProgressBar is the one bar; manual progress goes through Update progress.' },
      { id: 'week-activity', title: 'Week activity card', note: 'Dashboard: last 7 days of points and habits (fake days).' },
      { id: 'empty-states', title: 'Empty states' },
      { id: 'skeletons', title: 'Skeletons', note: 'First load of a data region only; actions keep the Ascend spinner. PageSkeleton is the lazy page fallback.' },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    sections: [
      { id: 'sidebar', title: 'Sidebar', note: 'The real desktop Sidebar from NAV_GROUPS: fold groups, collapse to the icon rail, status marks, bell, rank chip, account.' },
      { id: 'navigation', title: 'Nav rows', note: 'NavItem trail and row layouts and NavSection headers, built from navConfig.' },
      { id: 'mobile-nav', title: 'Mobile zone bar & sheet', note: 'Phones: Dashboard + four zones; tapping the zone on screen opens its sheet.' },
      { id: 'account-menu', title: 'Account menu' },
      { id: 'command-palette', title: 'Command palette', note: 'Every page from navConfig; type to filter, arrows and Enter, Esc closes.' },
      { id: 'tabs', title: 'Tabs', note: 'Non-scrollable strips are wider than a phone on purpose; this box scrolls sideways instead of the page.' },
      { id: 'static-tabs', title: 'Static tab panel' },
      { id: 'tab-swipe', title: 'Tab swipe' },
    ],
  },
  {
    id: 'dialogs',
    label: 'Dialogs & overlays',
    sections: [
      { id: 'dialogs', title: 'Dialogs', note: 'title, description, body and a pinned footer; Discard changes? guard; preventClose while saving.' },
      { id: 'logout', title: 'Log out', note: 'LogoutConfirmModal and the guest warning (GuestLogoutWarningModal). Confirm only waits; nobody is signed out.' },
      { id: 'rename', title: 'Rename', note: 'ui/RenameDialog (habits, bad habits): same-name rule, unsaved guard, a failing save shows its error.' },
      { id: 'pfc-edit', title: 'PFC edits', note: "Edit a log's words: focus task and note, decision text, emotion note. Saves change this page only." },
      { id: 'mood-picker', title: 'Mood picker', note: "journal/moods: the picker shared by today's entry and an earlier entry's edit, and MoodBadge." },
      { id: 'notification-center', title: 'Notification center', note: 'The real bell with an in-memory list: mark read, mark all, clear. Nothing leaves this page.' },
    ],
  },
  {
    id: 'feedback',
    label: 'Feedback',
    sections: [
      { id: 'toasts', title: 'Toasts', note: "For list and page actions and successes; never for a form's errors." },
      { id: 'banners', title: 'Banners', note: 'The one banner slot above the shell: Offline > Back online > New version > Timezone wait (one at a time).' },
      { id: 'push-prompt', title: 'Push prompt', note: "A static copy of PushPromptCard: the real card's Turn on subscribes this browser and saves it to the account." },
      { id: 'error-boundary', title: 'Error boundary', note: 'Throw inside a local ErrorBoundary to see the fallback (section and page variants).' },
      { id: 'sounds', title: 'Sound & vibration', note: 'The two sounds in use; the other candidates are folded away.' },
      { id: 'loaders', title: 'Loaders', note: 'The Streak loader everywhere; growth trace along the bottom of loading screens.' },
    ],
  },
  {
    id: 'lists',
    label: 'Lists & rows',
    sections: [
      { id: 'swipe-rows', title: 'Swipe rows', note: "On a touch screen: drag right for Done/Undo, left for Delete. The Reading habit can't be ticked here. Mouse uses the buttons." },
      { id: 'reorder', title: 'Reorder mode', note: 'The shared Reorder mode (lazy, @dnd-kit): drag the handle, arrows, keyboard (Space, arrows, Esc). Done keeps the order on this page only.' },
    ],
  },
  {
    id: 'leagues',
    label: 'Leagues & ranks',
    sections: [
      { id: 'tier-badges', title: 'Tier badges', note: 'TierBadge for every rank in TIERS, at each size.' },
      { id: 'rank-chip', title: 'Rank chip', note: 'RankChip (sidebar standing) at the start, mid-rank and the top rank.' },
      { id: 'league-rows', title: 'League rows', note: 'A Leagues board row (RankNumber, You tag, tier, points) and the past-standings row.' },
      { id: 'league-countdown', title: 'League countdown' },
      { id: 'member-card', title: 'Member card', note: 'CompetitorProfileModal in each state, with fake members (no fetch).' },
      { id: 'rank-up', title: 'Rank up', note: 'The real overlay with its fanfare (sound plays even if your tick choice is vibration). Starter to Trainer clean, Achiever to Expert richer, Leader and Master the full show; a jump is one level grander. Try both themes and reduced motion.' },
    ],
  },
  {
    id: 'dock',
    label: 'Dock',
    sections: [
      { id: 'focus-chip', title: 'Focus mini-pill', note: 'FocusTimerChip with a fake session: focus, paused, break, done. No real timer or notification starts.' },
      { id: 'block-pill', title: 'Block pill', note: 'The current Time Tracker block (fake day): a block now, free until the next, nothing planned.' },
      { id: 'floating-dock', title: 'Floating dock', note: 'Both chips in the real FloatingDock (fixed, bottom of the screen); drag it to the other side.' },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    sections: [
      { id: 'module-tiles', title: 'Module tiles', note: 'A copy of the Dashboard ModuleLink (keep in step): one line on phones, a tile from sm; every tone, a long value, an empty state.' },
      { id: 'league-summary', title: 'League summary rows', note: "A copy of the Dashboard LeagueRow (keep in step): loading, ready, failed, no points." },
      { id: 'ascent-profile', title: 'Ascent profile', note: 'The rank climb on the Dashboard at a few season points.' },
    ],
  },
  {
    id: 'charts',
    label: 'Charts',
    sections: [
      { id: 'charts', title: 'Charts' },
      { id: 'chart-tooltip', title: 'Chart tooltip', note: 'ChartTooltip on its own, anchored left, middle and right.' },
    ],
  },
  {
    id: 'auth',
    label: 'Auth',
    sections: [
      { id: 'ember', title: 'Ember', note: 'The sign-in mascot in every pose. Pick one to see it; pick it again to replay its move. Try reduced motion and a phone width.' },
      { id: 'password', title: 'Password fields', note: 'PasswordInput (show/hide) and the PasswordStaircase strength steps. Nothing is sent.' },
    ],
  },
  {
    id: 'excluded',
    label: 'Not in the Gallery',
    sections: [{ id: 'not-shown', title: 'Not shown on purpose' }],
  },
];

export const SECTION_INFO: ReadonlyMap<string, GallerySectionInfo> = new Map(
  GALLERY_GROUPS.flatMap((group) => group.sections.map((section) => [section.id, section] as const))
);
