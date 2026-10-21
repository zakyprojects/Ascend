import { MarketingLayout } from '../components/MarketingLayout';
import { FEATURES, type FeatureSlug } from '../features/catalog';

/** `/features/<slug>`: one feature, written from the app's real rules. */
export function FeaturePage({ slug }: { slug: FeatureSlug }) {
  const feature = FEATURES[slug];
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
        <h1 className="page-title">{feature.h1}</h1>
      </section>
    </MarketingLayout>
  );
}
