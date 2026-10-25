import type { CSSProperties } from 'react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { FUEL_MENU, fuelMailto, MAKER_INTRO, MAKER_LEAD, MAKER_STORY, SUPPORT_INTRO } from '@/components/settings/makerContent';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { Breadcrumb } from '../components/Breadcrumb';
import { LINK_CLASS, MarketingLayout } from '../components/MarketingLayout';
import { CtaBand, Section, SectionHeading } from '../components/Sections';

/** Hero entrance order (marketing.css .m-enter staggers by --i). */
const enter = (i: number) => ({ '--i': i }) as CSSProperties;

function Email() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={cx(LINK_CLASS, 'break-words')}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

/** /about: who makes Ascend and why (the same story as Settings > About us), and how to support it. */
export function About() {
  return (
    <MarketingLayout>
      <section aria-labelledby="about-title" className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'About' }]} />
        <div className="mt-8 max-w-3xl lg:mt-12">
          <p className="m-enter text-sm font-medium text-brand-text" style={enter(0)}>
            About Ascend
          </p>
          <h1 id="about-title" className="m-enter mt-3 font-serif text-4xl leading-[1.08] tracking-tight text-content-primary sm:text-6xl" style={enter(1)}>
            {MAKER_LEAD}
          </h1>
          <div className="m-enter mt-6 space-y-4 text-base leading-relaxed text-content-tertiary sm:text-lg" style={enter(2)}>
            <p>
              Ascend, also known as AscendDay, is a free gamified self-improvement app made in Pakistan. Habits, workouts, reading, journaling, goals and more
              live in one place, everything you log earns points, and the points put you in leagues against other
              people who are climbing too.
            </p>
            <p>{MAKER_INTRO}</p>
          </div>
        </div>
      </section>

      <Section labelledBy="story-title">
        <h2 id="story-title" className="sr-only">
          The story behind Ascend
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {MAKER_STORY.map((part) => (
            <article key={part.title} className="card p-6 sm:p-8">
              <h3 className="text-xl font-semibold text-content-primary">{part.title}</h3>
              <div className="mt-4 space-y-4 text-base leading-relaxed text-content-secondary">
                {part.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section labelledBy="shape-title">
        <SectionHeading id="shape-title" kicker="Help shape it" title="Tell me what to fix or build next" />
        <div className="card scroll-rise mt-8 max-w-3xl p-6 sm:p-8 text-base leading-relaxed text-content-secondary">
          <p>
            Ascend grows from what the people using it tell me. Inside the app, Settings has Report a bug and Suggest an
            idea. For anything else, email me at <Email />.
          </p>
        </div>
      </Section>

      <Section labelledBy="support-title">
        <SectionHeading id="support-title" kicker="Support Ascend" title="Buy us a coffee">
          {SUPPORT_INTRO}
        </SectionHeading>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {FUEL_MENU.map(({ name, line, icon: Icon }) => (
            <li key={name}>
              <a
                href={fuelMailto(name)}
                className={cx(
                  'card flex h-full flex-col gap-4 p-6 transition-colors hover:border-primary-500/40',
                  FOCUS_RING
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-500/10 text-brand-text">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="space-y-1">
                  <span className="block text-base font-semibold text-content-primary">{name}</span>
                  <span className="block text-sm leading-relaxed text-content-muted">{line}</span>
                </span>
                <span className="mt-auto text-sm font-medium text-brand-text">Email me</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="card scroll-rise mt-6 p-6 sm:p-8 text-base leading-relaxed text-content-secondary">
          <h3 className="text-lg font-semibold text-content-primary">Free ways to help</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-content-muted">
            <li>Tell a friend about Ascend. More people in a league makes it better for everyone.</li>
            <li>Found something broken, or have an idea? Use Report a bug or Suggest an idea in the app’s Settings.</li>
          </ul>
          <p className="mt-4 text-sm text-content-muted">
            Nothing is paid on this site or in the app. Thank you for being here.
          </p>
        </div>
      </Section>

      <CtaBand id="cta-title" title="See where you stand this week">
        It’s free. Join, log today, and the league does the rest.
      </CtaBand>
    </MarketingLayout>
  );
}
