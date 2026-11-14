import { Section } from './shared';

// What the Gallery leaves out, and why, so a missing component is a decision and not a gap.
const NOT_SHOWN: Array<{ name: string; why: string }> = [
  { name: 'QuickLog (nav/QuickLog.tsx)', why: 'Logs straight into the real store (points and Supabase writes). Zakria 2026-11-07: keep it out.' },
  { name: 'CaptchaSlot (ui/CaptchaSlot.tsx)', why: 'Loads the Turnstile script from Cloudflare. Zakria 2026-11-07: keep it out.' },
  { name: 'DeleteAccountDialog (settings/DeleteAccountDialog.tsx)', why: 'Embeds CaptchaSlot, so it is out with it.' },
  { name: 'PushPromptCard (live)', why: 'Its Turn on subscribes this browser and saves it to the account; Feedback › Push prompt is a static copy of its markup.' },
  { name: 'BannerStack (live)', why: 'Reads the live connection, version and timezone hooks; Feedback › Banners shows each banner in the same slot instead.' },
  { name: 'Journal entry edit, skill edit, workout edit dialogs', why: 'Written inline in Journal.tsx, SkillTracker.tsx and ExerciseTracker.tsx on top of the store; showing them needs extracting them from the page first. Their shared parts are here: MoodPicker, RenameDialog, exerciseAmountText.' },
  { name: 'Module rows (HabitRow, BadHabitRow, GoalRow, TaskRow, ItemCard, BookCard, PlanCard, DecisionCard, NowCard)', why: 'Page rows wired to store callbacks; optional in the plan and left for a later pass.' },
];

export function ExcludedGroup() {
  return (
    <Section id="not-shown">
      <ul className="space-y-2">
        {NOT_SHOWN.map((item) => (
          <li key={item.name} className="text-sm">
            <span className="text-content-primary">{item.name}</span>
            <span className="text-content-muted"> · {item.why}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
