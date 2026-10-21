import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { TIERS } from '@/lib/tiers';
import { Breadcrumb } from '../components/Breadcrumb';
import { LINK_CLASS, MarketingLayout } from '../components/MarketingLayout';
import { Screenshot } from '../components/Screenshot';
import { CtaBand, Section, SectionHeading } from '../components/Sections';
import { FEATURE_GROUPS, FEATURE_SLUGS, featurePath, featuresInGroup, type FeatureSlug } from '../features/catalog';

/** Hero entrance order (marketing.css .m-enter staggers by --i). */
const enter = (i: number) => ({ '--i': i }) as CSSProperties;

/** The parts that earn no points (the landing page says the same). */
const NO_POINTS: FeatureSlug[] = ['projects-goals', 'plans', 'accountability-partners'];
/** Ranks and leagues are where points go, not where they come from. */
const SCOREBOARD: FeatureSlug[] = ['leagues', 'ranks'];

const GROUP_TEXT: Record<string, string> = {
  Track:
    'The everyday logging: habits you build, habits you break, workouts, reading, skill practice and a day planned in time blocks. Almost everything here earns points up to a daily cap.',
  Mind: 'The quieter work: a clean-streak tracker for recovery, a focus timer with short lessons on how the brain changes, and a private daily journal.',
  Plan: 'Where you decide what the days are for: a few goals each week, bigger goals broken into projects and tasks, and plans you can share or copy.',
  Play: 'Where it turns into a game: leagues against real people, a rank that climbs with your season points, and a partner who keeps you honest.',
};

function tag(slug: FeatureSlug) {
  if (NO_POINTS.includes(slug)) return 'No points';
  if (SCOREBOARD.includes(slug)) return 'Scoreboard';
  return 'Earns points';
}

export function FeaturesHub() {
  return (
    <MarketingLayout>
      <section aria-labelledby="hub-title" className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Features' }]} />
        <div className="mt-8 max-w-3xl lg:mt-12">
          <p className="m-enter text-sm font-medium text-brand-text" style={enter(0)}>
            Ascend features
          </p>
          <h1 id="hub-title" className="m-enter mt-3 font-serif text-4xl leading-[1.08] tracking-tight text-content-primary sm:text-6xl" style={enter(1)}>
            Everything Ascend does
          </h1>
          <div className="m-enter mt-6 space-y-4 text-base leading-relaxed text-content-tertiary sm:text-lg" style={enter(2)}>
            <p>
              Ascend is a free gamified self-improvement app with {FEATURE_SLUGS.length} parts, grouped the way the app
              groups them: Track, Mind, Plan and Play. What you log in one part earns points, the points build your rank
              across {TIERS.length} ranks, and the leagues show how your week compares with everyone else’s.
            </p>
            <p>Each part below has its own page with how it works, the exact points rules, and who it suits.</p>
          </div>
        </div>
      </section>

      {FEATURE_GROUPS.map((group) => (
        <Section key={group.id} labelledBy={`group-${group.id}`} className="!pt-14 sm:!pt-20">
          <SectionHeading id={`group-${group.id}`} kicker={group.line} title={group.id}>
            {GROUP_TEXT[group.id]}
          </SectionHeading>
          <ul className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {featuresInGroup(group.id).map((feature) => {
              const Icon = feature.icon;
              const label = tag(feature.slug);
              return (
                <li key={feature.slug} className="flex">
                  <a href={featurePath(feature.slug)} className={cx('card card-hover group flex w-full flex-col p-5', FOCUS_RING)}>
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 font-semibold text-content-primary">{feature.name}</span>
                      <span
                        className={cx(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                          label === 'Earns points' ? 'bg-primary-500/10 text-brand-text' : 'bg-overlay-subtle text-content-muted'
                        )}
                      >
                        {label}
                      </span>
                    </span>
                    <span className="mt-3 text-sm leading-relaxed text-content-tertiary">{feature.summary}</span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand-text">
                      See how it works
                      <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-base group-hover:translate-x-0.5" />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <Section labelledBy="connect-title">
        <div className="grid items-center gap-10 grid-cols-1 lg:grid-cols-2">
          <div>
            <SectionHeading id="connect-title" kicker="How it fits together" title="One score for your whole day">
              Every part feeds the same season points. A workout, ten pages and a journal entry all count toward the same
              rank, so a slow day in one part can be made up in another, and a missed habit costs from the same total.
            </SectionHeading>
            <div className="scroll-rise mt-6 space-y-3 text-sm leading-relaxed text-content-tertiary">
              <p>
                Most parts have a daily cap, so one long session can’t buy a rank. Projects &amp; Goals, Plans and Partners
                are for planning and support and earn no points.
              </p>
              <p>
                New here? Start with{' '}
                <a href={featurePath('habits')} className={LINK_CLASS}>
                  three habits
                </a>
                , one{' '}
                <a href={featurePath('bad-habits')} className={LINK_CLASS}>
                  bad habit to stop
                </a>{' '}
                and the{' '}
                <a href={featurePath('journal')} className={LINK_CLASS}>
                  journal
                </a>
                , then add the rest as they become useful. See{' '}
                <a href={featurePath('ranks')} className={LINK_CLASS}>
                  how ranks work
                </a>{' '}
                for the whole ladder.
              </p>
            </div>
          </div>
          <div className="scroll-rise">
            <Screenshot
              name="dashboard-desktop"
              width={1600}
              height={589}
              alt="The Ascend dashboard: today’s habits, season points and the rank climb from Beginner to Master"
            />
          </div>
        </div>
      </Section>

      <CtaBand id="cta-title" title="Try every part, free">
        Start as a guest, log one thing today, and save your progress to a free account when you’re ready.
      </CtaBand>
    </MarketingLayout>
  );
}
