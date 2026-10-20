import type { ReactNode } from 'react';
import { Coffee, CupSoda, Flame, type LucideIcon } from 'lucide-react';
import type { View } from '@/lib/views';
import { cx, FOCUS_RING } from '@/components/ui/primitives';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { pageLinkProps } from '@/lib/pageLink';
import { SettingsCard } from './SettingRow';

const LINK_CLASS = cx('font-medium text-brand-text hover:underline underline-offset-2 rounded', FOCUS_RING);

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-content-primary">{title}</h3>
      {children}
    </div>
  );
}

function PageLink({ view, label, onNavigate }: { view: View; label: string; onNavigate: (view: View) => void }) {
  return (
    <a {...pageLinkProps(view, onNavigate)} className={LINK_CLASS}>
      {label}
    </a>
  );
}

function Email() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={cx(LINK_CLASS, 'break-words')}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

/** Settings > About us: the person who makes Ascend, and why. */
export function AboutUsSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="About us">
      <div className="space-y-8 text-sm leading-relaxed text-content-secondary">
        <div className="space-y-2">
          <p className="text-base font-medium text-content-primary">
            Made by a student who thinks competition can be put to better use.
          </p>
          <p>
            Hi, I’m Zakria Khan. I’m from Risalpur Cantt in Khyber Pakhtunkhwa, I study Computer Science in Peshawar,
            and I’ve completed Harvard’s CS50x and CS50P. I build Ascend on my own.
          </p>
        </div>

        <Part title="Why I built it">
          <p>
            People love to compete. We do it in almost everything: grades, jobs, salaries, business, and on a bigger
            scale countries compete over technology, the economy and power. Psychologists call part of this social
            comparison: we work out how we’re doing by looking at the people around us.
          </p>
          <p>
            What caught my attention is what happens when someone’s life doesn’t have much of it. The need doesn’t go
            away. People find it somewhere else, and for a lot of us that place is a competitive game like PUBG,
            Valorant or Call of Duty. You grind for a rank, you want to beat the other side, and you come back the next
            day.
          </p>
          <p>
            One question stayed with me: what if that same drive went into real life? You’d still get the competition.
            But at the end of a season you’d also have read more, trained more and kept more of your habits. I couldn’t
            think of a better trade, so I started building Ascend.
          </p>
        </Part>

        <Part title="The idea">
          <p>
            In a league you’re up against other people who are climbing too, and that’s what gets you started. But the
            one really worth beating is who you were yesterday. Will Durant summed up Aristotle as “We are what we
            repeatedly do.” Ascend counts the repeating.
          </p>
          <p>
            It only works if you’re honest with yourself. Logging a workout you didn’t do might win you a league, but it
            won’t change anything about you. The points are there to push you. The real prize is what changes in you.
          </p>
        </Part>

        <Part title="Help shape it">
          <p>
            Ascend grows from what the people using it tell me. If something breaks, use{' '}
            <PageLink view="report-bug" label="Report a bug" onNavigate={onNavigate} />. If you wish it did something,
            use <PageLink view="suggest-idea" label="Suggest an idea" onNavigate={onNavigate} />. For anything else,
            email me at <Email />.
          </p>
        </Part>
      </div>
    </SettingsCard>
  );
}

/** One drink on the Support menu. Nothing is paid in the app: each one opens an email to Zakria. */
const FUEL_MENU: { name: string; line: string; icon: LucideIcon }[] = [
  { name: 'A chai', line: 'A small thank-you that says keep going.', icon: CupSoda },
  { name: 'A coffee', line: 'Fuel for a late night of fixing and building.', icon: Coffee },
  { name: 'A streak saver', line: 'For when Ascend really helped you and you want it to keep climbing.', icon: Flame },
];

function fuelMailto(name: string) {
  const subject = encodeURIComponent(`Fuel the Streak: ${name}`);
  return `mailto:${LEGAL_CONTACT_EMAIL}?subject=${subject}`;
}

/** Settings > Support: a "buy me a coffee" menu (by email, no payments in the app) and free ways to help. */
export function SupportSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="Fuel the Streak">
      <div className="space-y-8 text-sm leading-relaxed text-content-secondary">
        <p>
          Ascend is built by one student. If it’s helped you keep a habit or win a week, you can buy me a chai or a
          coffee. Pick one and send me an email, and I’ll reply with how to send it.
        </p>

        <ul className="grid gap-3 sm:grid-cols-3">
          {FUEL_MENU.map(({ name, line, icon: Icon }) => (
            <li key={name}>
              <a
                href={fuelMailto(name)}
                className={cx(
                  'flex h-full flex-col gap-3 rounded-xl border border-overlay-default p-4 transition-colors hover:border-primary-500/40 hover:bg-overlay-subtle',
                  FOCUS_RING
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-500/10 text-brand-text">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-content-primary">{name}</span>
                  <span className="block text-xs leading-relaxed text-content-muted">{line}</span>
                </span>
                <span className="mt-auto text-xs font-medium text-brand-text">Email me</span>
              </a>
            </li>
          ))}
        </ul>

        <Part title="Free ways to help">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-content-muted">
            <li>Tell a friend about Ascend. More people in a league makes it better for everyone.</li>
            <li>
              Found something broken? <PageLink view="report-bug" label="Report a bug" onNavigate={onNavigate} />.
            </li>
            <li>
              Have an idea? <PageLink view="suggest-idea" label="Suggest an idea" onNavigate={onNavigate} />.
            </li>
          </ul>
        </Part>

        <p className="text-xs text-content-muted">
          Anything else, write to <Email />. Thank you for being here.
        </p>
      </div>
    </SettingsCard>
  );
}
