import { MarketingLayout } from '../components/MarketingLayout';

/** `/`: the public landing page. */
export function Landing() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
        <h1 className="page-title">Ascend – Gamified Self-Improvement</h1>
      </section>
    </MarketingLayout>
  );
}
