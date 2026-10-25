import { cx } from '@/components/ui/primitives/shared';

/**
 * A real app screen (public/screens/<name>-dark.webp and -light.webp, captured from the app with
 * demo data), the one for the page's theme shown (marketing.css .m-shot-*). Width and height are
 * the files' own, so the box is reserved before the image loads (no layout shift).
 */
export function Screenshot({
  name,
  alt,
  width,
  height,
  eager = false,
  className,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  /** The first screen's picture: loaded at once instead of when it scrolls near. */
  eager?: boolean;
  className?: string;
}) {
  const loading = eager ? 'eager' : 'lazy';
  const img = 'block h-auto w-full';
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-overlay-default bg-bg-800 shadow-sm', className)}>
      <img src={`/screens/${name}-dark.webp`} alt={alt} width={width} height={height} loading={loading} decoding="async" className={cx('m-shot-dark', img)} />
      <img src={`/screens/${name}-light.webp`} alt={alt} width={width} height={height} loading={loading} decoding="async" className={cx('m-shot-light', img)} />
    </div>
  );
}

interface ShotFile {
  name: string;
  width: number;
  height: number;
}

/** <source>s for one theme: the desktop capture from 640px up, else the phone one (the <img>). */
function themeSources(desktop: ShotFile, theme: 'dark' | 'light', scheme = '') {
  return <source media={`(min-width: 640px)${scheme}`} srcSet={`/screens/${desktop.name}-${theme}.webp`} width={desktop.width} height={desktop.height} />;
}

/**
 * The hero's picture, the page's largest paint. One <picture> picks the phone or desktop capture by
 * width and dark or light by the device's setting (the same fallback as THEME_SCRIPT), so the
 * browser fetches only the one on screen, early and at high priority. A theme saved on this site
 * that differs from the device's swaps in a lazy copy for that theme (marketing.css .m-hero-*),
 * which is fetched only then. Each source carries its file's size, so nothing shifts.
 */
export function HeroShot({ alt, phone, desktop, className }: { alt: string; phone: ShotFile; desktop: ShotFile; className?: string }) {
  const light = ' and (prefers-color-scheme: light)';
  const img = 'block h-auto w-full';
  const phoneSrc = (theme: 'dark' | 'light') => `/screens/${phone.name}-${theme}.webp`;
  const high = { fetchpriority: 'high' } as Record<string, string>; // React 18 knows only the lowercase attribute
  return (
    <div className={cx('overflow-hidden bg-bg-800 shadow-sm', className)}>
      <picture className="m-hero-auto">
        {themeSources(desktop, 'light', light)}
        {themeSources(desktop, 'dark')}
        <source media="(prefers-color-scheme: light)" srcSet={phoneSrc('light')} width={phone.width} height={phone.height} />
        <img src={phoneSrc('dark')} alt={alt} width={phone.width} height={phone.height} loading="eager" {...high} className={img} />
      </picture>
      {(['dark', 'light'] as const).map((theme) => (
        <picture key={theme} className={`m-hero-${theme}`}>
          {themeSources(desktop, theme)}
          <img src={phoneSrc(theme)} alt={alt} width={phone.width} height={phone.height} loading="lazy" decoding="async" className={img} />
        </picture>
      ))}
    </div>
  );
}
