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
    label: "Foundations",
    sections: [
      { id: 'typography', title: "Typography", note: "Geist everywhere; serif and mono only where the rules allow." },
      { id: 'badges', title: "Badges" },
      { id: 'brand', title: "Brand", note: "The Streak: every logo, icon and loader in the app. Toggle the theme to check both." },
    ],
  },
  {
    id: 'actions',
    label: "Actions",
    sections: [
      { id: 'buttons', title: "Buttons", note: "The Button primitive: variants, sizes, disabled and loading." },
      { id: 'button-classes', title: "Button classes", note: "The .btn-* classes in index.css, used by dialog footers, page headers and many pages. Solid destructive confirms use .btn-danger-solid; .btn-danger is the soft one." },
      { id: 'switch', title: "Switch" },
      { id: 'segmented', title: "Segmented and filter rows", note: "SlidingPill glides the active background; active is neutral." },
    ],
  },
  {
    id: 'forms',
    label: "Forms",
    sections: [
      { id: 'fields', title: "Fields", note: "Input, Select, Textarea, NumberField, FieldRow (two columns from sm), optional marker, hint, error." },
      { id: 'dropdowns', title: "Dropdowns", note: "Select (field), ToolbarSelect, StatusSelect: the app's own list, never the browser's picker. Keyboard: arrows, Home/End, letters, Enter/Space, Esc, Tab." },
      { id: 'form-errors', title: "Form errors", note: "One problem at a time as a bubble under its field; the field is focused and scrolled to. Press Save with everything empty." },
    ],
  },
  {
    id: 'layout',
    label: "Containers & layout",
    sections: [
      { id: 'cards', title: "Cards" },
      { id: 'disclosure', title: "Disclosure" },
    ],
  },
  {
    id: 'pageparts',
    label: "Page parts",
    sections: [
      { id: 'page-parts', title: "Page parts", note: "Fake numbers; the real pages pass store values." },
      { id: 'how-it-works', title: "How it works", note: "Button under the page subtitle; the CapMeter's How points work opens the same dialog at Points. Never opens on its own." },
      { id: 'progress', title: "Progress", note: "ProgressBar is the one bar; manual progress goes through Update progress." },
      { id: 'empty-states', title: "Empty states" },
      { id: 'skeletons', title: "Skeletons", note: "First load of a data region only; actions keep the Ascend spinner." },
    ],
  },
  {
    id: 'navigation',
    label: "Navigation",
    sections: [
      { id: 'navigation', title: "Navigation" },
      { id: 'tabs', title: "Tabs", note: "Non-scrollable strips are wider than a phone on purpose; this box scrolls sideways instead of the page." },
      { id: 'tab-swipe', title: "Tab swipe" },
    ],
  },
  {
    id: 'dialogs',
    label: "Dialogs & overlays",
    sections: [
      { id: 'dialogs', title: "Dialogs", note: "title, description, body and a pinned footer; Discard changes? guard; preventClose while saving." },
    ],
  },
  {
    id: 'feedback',
    label: "Feedback",
    sections: [
      { id: 'toasts', title: "Toasts", note: "For list and page actions and successes; never for a form’s errors." },
      { id: 'sounds', title: "Sound & vibration" },
      { id: 'loaders', title: "Loaders", note: "The Streak loader everywhere; growth trace along the bottom of loading screens." },
    ],
  },
  {
    id: 'lists',
    label: "Lists & rows",
    sections: [
      { id: 'swipe-rows', title: "Swipe rows", note: "On a touch screen: drag right for Done/Undo, left for Delete. The Reading habit can’t be ticked here. Mouse uses the buttons." },
    ],
  },
  {
    id: 'leagues',
    label: "Leagues & ranks",
    sections: [
      { id: 'rank-up', title: "Rank up", note: "The real overlay with its fanfare (sound plays even if your tick choice is vibration). Starter to Trainer clean, Achiever to Expert richer, Leader and Master the full show; a jump is one level grander. Try both themes and reduced motion." },
    ],
  },
  {
    id: 'charts',
    label: "Charts",
    sections: [
      { id: 'charts', title: "Charts" },
    ],
  },
  {
    id: 'auth',
    label: "Auth",
    sections: [
      { id: 'ember', title: "Ember", note: "The sign-in mascot in every pose. Pick one to see it; pick it again to replay its move. Try reduced motion and a phone width." },
    ],
  },
];

export const SECTION_INFO: ReadonlyMap<string, GallerySectionInfo> = new Map(
  GALLERY_GROUPS.flatMap((group) => group.sections.map((section) => [section.id, section] as const))
);
