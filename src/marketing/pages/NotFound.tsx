import { MarketingLayout } from '../components/MarketingLayout';

/** dist/404.html: Vercel serves it with status 404 for any address that is no page. */
export function NotFound() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-20 pb-10 text-center">
        <p className="stat-label">Error 404</p>
        <h1 className="page-title mt-2">This page doesn’t exist</h1>
        <p className="mt-4 text-content-muted">
          The address may have a typo, or the page moved. Everything Ascend does is one click away.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/" className="btn-primary min-h-11">
            Go to the home page
          </a>
          <a href="/features" className="btn-secondary min-h-11">
            See all features
          </a>
          <a href="/dashboard" className="btn-ghost min-h-11">
            Open Ascend
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
