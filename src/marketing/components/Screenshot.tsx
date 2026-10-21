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
