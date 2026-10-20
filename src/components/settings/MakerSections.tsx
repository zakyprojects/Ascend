import type { ReactNode } from 'react';
import type { View } from '@/lib/views';
import { cx, FOCUS_RING } from '@/components/ui/primitives';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { pageLinkProps } from '@/lib/pageLink';
import { SettingsCard } from './SettingRow';

const LINK_CLASS = cx('font-medium text-brand-text hover:underline underline-offset-2 rounded', FOCUS_RING);

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-content-primary">{title}</h3>
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
      <div className="space-y-6 text-sm leading-relaxed text-content-secondary">
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

/** Settings > Support: ways to help Ascend. No payments in the app; money offers go by email. */
export function SupportSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="Support">
      <div className="space-y-6 text-sm leading-relaxed text-content-secondary">
        <p>Ascend is built by one student, and most of the ways to help it don’t cost anything.</p>

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

        <Part title="Want to support it another way?">
          <p>
            If you’d like to help with costs or support Ascend in some other way, email me at <Email /> and we’ll
            talk.
          </p>
        </Part>
      </div>
    </SettingsCard>
  );
}
