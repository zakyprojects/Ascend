import type { ReactNode } from 'react';
import { ChevronDown, Menu, Moon, Sun } from 'lucide-react';
import { AppLockup, AppLogo } from '@/components/ui/AppLogo';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { FEATURE_GROUPS, featurePath, featuresInGroup } from '../features/catalog';
import { SITE_DESCRIPTOR, SITE_MAKER, SITE_NAME, SITE_TAGLINE } from '../site';

export const LINK_CLASS = cx('font-medium text-brand-text hover:underline underline-offset-2 rounded', FOCUS_RING);
const NAV_LINK = cx(
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-content-tertiary transition-colors duration-base hover:text-content-primary hover:bg-overlay-subtle',
  FOCUS_RING
);

/** The light/dark switch. client.ts flips it; the icon shown follows data-theme (marketing.css). */
function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle=""
      aria-label="Switch theme"
      title="Switch theme"
      className={cx('btn-ghost relative h-11 w-11 shrink-0 px-0', FOCUS_RING)}
    >
      <span className="relative block h-[18px] w-[18px]" aria-hidden="true">
        <Sun size={18} className="m-theme-icon m-theme-sun absolute inset-0 m-auto" />
        <Moon size={18} className="m-theme-icon m-theme-moon absolute inset-0 m-auto" />
      </span>
    </button>
  );
}

/** Header "Features" menu: a <details>, so it opens without JavaScript (client.ts closes it on outside clicks). */
function FeaturesMenu() {
  return (
    <details className="m-menu relative" data-menu="">
      {/* Below 420px the label becomes a menu icon (still named Features), so the lockup fits. */}
      <summary className={cx(NAV_LINK, 'cursor-pointer list-none gap-1 max-[419px]:w-11 max-[419px]:justify-center max-[419px]:px-0 [&::-webkit-details-marker]:hidden')}>
        <Menu size={20} className="hidden max-[419px]:block" aria-hidden="true" />
        <span className="max-[419px]:sr-only">Features</span>
        <ChevronDown size={16} className="m-menu-chevron transition-transform duration-base max-[419px]:hidden" aria-hidden="true" />
      </summary>
      <div className="m-menu-panel card absolute right-0 top-full mt-2 w-[min(92vw,44rem)] p-4 sm:p-5 z-popover max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto max-sm:max-h-[75vh] max-sm:overflow-y-auto">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="stat-label px-2">{group.id}</p>
              <ul className="mt-1">
                {featuresInGroup(group.id).map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <li key={feature.slug}>
                      <a
                        href={featurePath(feature.slug)}
                        className={cx(
                          'flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-content-secondary transition-colors duration-base hover:bg-overlay-subtle hover:text-content-primary',
                          FOCUS_RING
                        )}
                      >
                        <Icon size={16} className="shrink-0 text-brand-text" aria-hidden="true" />
                        {feature.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4">
          <a href="/features" className={cx(LINK_CLASS, 'inline-flex min-h-11 items-center px-2 text-sm')}>
            See all features
          </a>
          {/* Phones hide the header's About link, so the menu carries it. */}
          <a href="/about" className={cx(LINK_CLASS, 'inline-flex min-h-11 items-center px-2 text-sm sm:hidden')}>
            About {SITE_NAME}
          </a>
        </div>
      </div>
    </details>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-sticky border-b border-overlay-subtle bg-bg-900/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 sm:gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        {/* The lockup is 20px high, 16px below 640px, 15px below 365px and the mark alone below 360px, so the header never overflows. */}
        <a href="/" aria-label={`${SITE_NAME} home`} className={cx('mr-auto inline-flex min-h-11 items-center rounded-lg', FOCUS_RING)}>
          <AppLockup className="h-5 w-auto text-content-primary max-sm:h-4 max-[364px]:h-[15px] max-[359px]:hidden" />
          <AppLogo variant="small" className="hidden h-7 w-auto max-[359px]:block" />
        </a>
        <nav aria-label="Main" className="flex items-center gap-1">
          <FeaturesMenu />
          <a href="/about" className={cx(NAV_LINK, 'max-sm:hidden')}>
            About
          </a>
          <a href="/login" className={cx(NAV_LINK, 'max-[479px]:hidden')}>
            Sign in
          </a>
        </nav>
        <ThemeToggle />
        <a href="/signup" data-cta="" data-cta-app-label="Open app" className="btn-primary min-h-11 shrink-0 max-sm:px-3">
          Get started
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-overlay-subtle mt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <a href="/" aria-label={`${SITE_NAME} home`} className={cx('inline-flex rounded-lg', FOCUS_RING)}>
              <AppLockup className="h-5 w-auto text-content-primary" />
            </a>
            <p className="mt-3 text-sm text-content-muted">{SITE_DESCRIPTOR}. {SITE_TAGLINE}</p>
          </div>
          {FEATURE_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="text-sm font-semibold text-content-primary">{group.id}</p>
              <ul className="mt-2 space-y-1">
                {featuresInGroup(group.id).map((feature) => (
                  <li key={feature.slug}>
                    <a
                      href={featurePath(feature.slug)}
                      className={cx('inline-flex min-h-9 items-center rounded text-sm text-content-muted hover:text-content-primary', FOCUS_RING)}
                    >
                      {feature.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t border-overlay-subtle pt-6 text-sm text-content-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {SITE_NAME} is free and in beta, made by {SITE_MAKER} in Pakistan. It is not affiliated with other apps named
            Ascend.
          </p>
          <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1">
            <a href="/features" className={cx('inline-flex min-h-9 items-center rounded hover:text-content-primary', FOCUS_RING)}>
              Features
            </a>
            <a href="/about" className={cx('inline-flex min-h-9 items-center rounded hover:text-content-primary', FOCUS_RING)}>
              About
            </a>
            <a href="/privacy" className={cx('inline-flex min-h-9 items-center rounded hover:text-content-primary', FOCUS_RING)}>
              Privacy
            </a>
            <a href="/terms" className={cx('inline-flex min-h-9 items-center rounded hover:text-content-primary', FOCUS_RING)}>
              Terms
            </a>
            <a href="/login" className={cx('inline-flex min-h-9 items-center rounded hover:text-content-primary', FOCUS_RING)}>
              Sign in
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/**
 * The frame of every marketing page: header (logo, Features menu, Sign in, theme, Get started),
 * the app's static atmosphere, the page, and a footer linking every feature page. `data-page-area`
 * gives cards and `.scroll-rise` blocks the app's scroll rise; "window" (the window scrolls here at
 * every width) selects the played-once version at every width (index.css + lib/scrollRise.ts).
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link btn-primary">
        Skip to content
      </a>
      <div aria-hidden="true" className="app-atmosphere" />
      <Header />
      <div data-page-area="window">
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}
