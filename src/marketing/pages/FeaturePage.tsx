import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { Breadcrumb } from '../components/Breadcrumb';
import { MarketingLayout } from '../components/MarketingLayout';
import { Screenshot } from '../components/Screenshot';
import { CtaBand, FaqList } from '../components/Sections';
import { FEATURES, featurePath, type FeatureSlug } from '../features/catalog';
import { Block } from '../features/blocks';
import { FEATURE_CONTENT } from '../features/content';
import { SITE_DEFINITION } from '../site';

/** Hero entrance order (marketing.css .m-enter staggers by --i). */
const enter = (i: number) => ({ '--i': i }) as CSSProperties;

function Dot({ muted }: { muted?: boolean }) {
  return <span aria-hidden="true" className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', muted ? 'bg-content-muted' : 'bg-primary-500')} />;
}

/** `/features/<slug>`: one feature, written from the app's real rules (features/pages/<slug>.tsx). */
export function FeaturePage({ slug }: { slug: FeatureSlug }) {
  const feature = FEATURES[slug];
  const content = FEATURE_CONTENT[slug];
  const crumbs = [{ name: 'Home', href: '/' }, { name: 'Features', href: '/features' }, { name: feature.name }];

  return (
    <MarketingLayout>
      <section aria-labelledby="feature-title" className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
        <Breadcrumb items={crumbs} />
        <div className="mt-8 grid items-center gap-10 grid-cols-1 lg:mt-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="m-enter text-sm font-medium text-brand-text" style={enter(0)}>
              {feature.name} · AscendDay
            </p>
            <h1
              id="feature-title"
              className="m-enter mt-3 font-serif text-4xl leading-[1.08] tracking-tight text-content-primary sm:text-5xl lg:text-6xl"
              style={enter(1)}
            >
              {feature.h1}
            </h1>
            <div className="m-enter mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-content-tertiary sm:text-lg" style={enter(2)}>
              {content.intro}
            </div>
            <div className="m-enter mt-8 flex flex-wrap gap-3" style={enter(3)}>
              <a href="/signup" data-cta="" className="btn-primary min-h-12 px-6 text-base">
                <span data-cta-label="">Start free</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a href="#how-points-work" className="btn-secondary min-h-12 px-6 text-base">
                How points work
              </a>
            </div>
            <p className="m-enter mt-4 text-sm text-content-muted" style={enter(4)}>
              Free · In beta · Phone and PC · No download needed
            </p>
          </div>
          <div className="m-enter lg:col-span-5" style={enter(3)}>
            <Screenshot
              {...content.heroShot}
              eager
              className="mx-auto w-full max-w-[260px] rounded-[1.75rem] border-4 border-bg-700 sm:max-w-[300px]"
            />
          </div>
        </div>
      </section>

      {content.body}

      <section aria-label={content.wideShot.caption} className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24">
        <figure className="scroll-rise">
          <Screenshot name={content.wideShot.name} width={content.wideShot.width} height={content.wideShot.height} alt={content.wideShot.alt} />
          <figcaption className="mt-3 text-center text-sm text-content-muted">{content.wideShot.caption}</figcaption>
        </figure>
      </section>

      <Block id="glance-title" title={`${feature.name} at a glance`} lead={<p>{SITE_DEFINITION}</p>}>
        <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-5">
          <dl className="card grid gap-4 p-6 sm:grid-cols-2 sm:p-8 lg:col-span-3">
            {content.facts.map(([term, value]) => (
              <div key={term}>
                <dt className="stat-label">{term}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-content-primary">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-6 lg:col-span-2">
            <div className="card p-6">
              <h3 className="font-semibold text-content-primary">A good fit if</h3>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-content-tertiary">
                {content.fitsIf.map((line) => (
                  <li key={line} className="flex gap-3">
                    <Dot />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <h3 className="font-semibold text-content-primary">Maybe not if</h3>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-content-tertiary">
                {content.notFor.map((line) => (
                  <li key={line} className="flex gap-3">
                    <Dot muted />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Block>

      <Block id="faq-title" title={`${feature.name}: questions people ask`}>
        <FaqList items={content.faq} />
      </Block>

      <Block id="related-title" title="Works well with">
        <ul className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {content.related.map((other) => {
            const meta = FEATURES[other];
            const Icon = meta.icon;
            return (
              <li key={other} className="flex">
                <a href={featurePath(other)} className={cx('card card-hover group flex w-full flex-col p-5', FOCUS_RING)}>
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="font-semibold text-content-primary">{meta.name}</span>
                  </span>
                  <span className="mt-3 text-sm leading-relaxed text-content-tertiary">{meta.summary}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand-text">
                    See how it works
                    <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-base group-hover:translate-x-0.5" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </Block>

      <CtaBand id="cta-title" title={content.cta.title}>
        {content.cta.text}
      </CtaBand>
    </MarketingLayout>
  );
}
