import type { ReactNode } from 'react';
import type { View } from '@/lib/views';
import { cx, FOCUS_RING } from '@/components/ui/primitives';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { pageLinkProps } from '@/lib/pageLink';
import { SettingsCard } from './SettingRow';
import { FUEL_MENU, fuelMailto, MAKER_INTRO, MAKER_LEAD, MAKER_STORY, SUPPORT_INTRO } from './makerContent';

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
          <p className="text-base font-medium text-content-primary">{MAKER_LEAD}</p>
          <p>{MAKER_INTRO}</p>
        </div>

        {MAKER_STORY.map((part) => (
          <Part key={part.title} title={part.title}>
            {part.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </Part>
        ))}

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

/** Settings > Support: a "buy me a coffee" menu (by email, no payments in the app) and free ways to help. */
export function SupportSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="Buy us a coffee">
      <div className="space-y-8 text-sm leading-relaxed text-content-secondary">
        <p>{SUPPORT_INTRO}</p>

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
