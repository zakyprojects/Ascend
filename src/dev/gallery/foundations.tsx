import React from 'react';
import { Badge, type BadgeTone } from '@/components/ui/primitives';
import { AscendLoaderMark } from '@/components/ui/AscendLoadingIndicator';
import { AppLockup, AppLogo } from '@/components/ui/AppLogo';
import { Caption, Section } from './shared';

const TONES: BadgeTone[] = [
  'neutral',
  'emerald',
  'warning',
  'amber',
  'purple',
  'cyan',
  'rose',
  'blue',
  'sky',
  'teal',
  'orange',
  'indigo',
  'violet',
  'season',
  'beta',
];

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

/** One labelled tile in the Brand section. */
function BrandItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex min-h-12 items-end">{children}</div>
      <span className="text-micro text-content-muted">{label}</span>
    </div>
  );
}

// The Sunday planning push's real text; the icon and badge are the files public/sw.js names.
const NOTIFICATION_ICON = '/android-chrome-192x192.png';
const NOTIFICATION_BADGE = '/notification-badge.png';

/** Rough Android look of an Ascend push: status bar small icon, shade header badge, large icon. */
function NotificationPreview() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#1f1f1f] text-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-1.5 text-micro text-white/80">
        <span className="flex items-center gap-1.5">
          <span className="tabular-nums">9:41</span>
          <img src={NOTIFICATION_BADGE} alt="" className="h-4 w-4" />
        </span>
        <span>100%</span>
      </div>
      <div className="m-2 rounded-2xl bg-[#2b2b2b] p-3">
        <div className="flex items-center gap-1.5 text-micro text-white/70">
          {/* Android tints the badge's alpha mask; colour in the file is ignored */}
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 bg-[#10b981]"
            style={{ maskImage: `url(${NOTIFICATION_BADGE})`, WebkitMaskImage: `url(${NOTIFICATION_BADGE})`, maskSize: 'contain', WebkitMaskSize: 'contain' }}
          />
          <span>AscendDay</span>
          <span aria-hidden="true">·</span>
          <span>now</span>
        </div>
        <div className="mt-1.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Sunday Evening Goal Planning</p>
            <p className="text-xs text-white/70">Take 5 minutes to set your top 3 measurable goals and review last week&apos;s velocity.</p>
          </div>
          <img src={NOTIFICATION_ICON} alt="" className="h-10 w-10 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function BrandDemo() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>Mark (AppLogo): emerald on dark, deep emerald on light; small (two gaps) at 32px and below</Caption>
        <div className="flex flex-wrap items-end gap-6">
          <BrandItem label="full 96">
            <AppLogo className="h-24 w-24" />
          </BrandItem>
          <BrandItem label="full 48">
            <AppLogo className="h-12 w-12" />
          </BrandItem>
          <BrandItem label="small 32 (header)">
            <AppLogo variant="small" className="h-8 w-8" />
          </BrandItem>
          <BrandItem label="small 28 (sidebar)">
            <AppLogo variant="small" className="h-7 w-7" />
          </BrandItem>
          <BrandItem label="small 16">
            <AppLogo variant="small" className="h-4 w-4" />
          </BrandItem>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Lockup (AppLockup): follows the theme; on the sign-in panel; fixed dark, light and mono files</Caption>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex h-24 items-center justify-center rounded-xl border border-overlay-subtle bg-bg-800">
            <AppLockup className="h-7 w-auto text-content-primary" />
          </div>
          <div className="flex h-24 items-center justify-center rounded-xl bg-[#112725]">
            <AppLockup className="h-7 w-auto text-primary-50" markClassName="text-primary-500" />
          </div>
          <div className="flex h-24 items-center justify-center rounded-xl bg-[#07110E]">
            <img src="/brand/lockup.svg" alt="Lockup on dark" className="h-16 w-auto" />
          </div>
          <div className="flex h-24 items-center justify-center rounded-xl bg-[#F4FBF8]">
            <img src="/brand/lockup-light.svg" alt="Lockup on light" className="h-16 w-auto" />
          </div>
          <div className="flex h-24 items-center justify-center rounded-xl bg-primary-600 sm:col-span-2">
            <img src="/brand/lockup-mono.svg" alt="Mono lockup" className="h-16 w-auto" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>App icons: Android (any), maskable cut as a circle and a squircle (logo stays in the safe zone), iOS, Windows tile</Caption>
        <div className="flex flex-wrap items-end gap-6">
          <BrandItem label="android-chrome 192">
            <img src="/android-chrome-192x192.png" alt="" className="h-24 w-24" />
          </BrandItem>
          <BrandItem label="maskable, circle">
            <img src="/maskable-icon-512x512.png" alt="" className="h-24 w-24 rounded-full" />
          </BrandItem>
          <BrandItem label="maskable, squircle">
            <img src="/maskable-icon-512x512.png" alt="" className="h-24 w-24 rounded-[30%]" />
          </BrandItem>
          <BrandItem label="maskable, full + safe zone">
            <span className="relative block h-24 w-24">
              <img src="/maskable-icon-512x512.png" alt="" className="h-24 w-24" />
              <span aria-hidden="true" className="absolute inset-[10%] rounded-full border border-dashed border-white/50" />
            </span>
          </BrandItem>
          <BrandItem label="apple-touch 180 (iOS rounds it)">
            <img src="/apple-touch-icon.png" alt="" className="h-[60px] w-[60px] rounded-[22%]" />
          </BrandItem>
          <BrandItem label="mstile 150">
            <img src="/mstile-150x150.png" alt="" className="h-[75px] w-[75px]" />
          </BrandItem>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Favicons at their real sizes (png 16, png 32, svg 16 / 32 / 48)</Caption>
        <div className="flex flex-wrap items-end gap-6">
          <BrandItem label="16 png">
            <img src="/favicon-16x16.png" alt="" width={16} height={16} />
          </BrandItem>
          <BrandItem label="32 png">
            <img src="/favicon-32x32.png" alt="" width={32} height={32} />
          </BrandItem>
          {[16, 32, 48].map((size) => (
            <BrandItem key={size} label={`${size} svg`}>
              <img src="/favicon.svg" alt="" width={size} height={size} />
            </BrandItem>
          ))}
          <BrandItem label="browser tab">
            <span className="flex items-center gap-2 rounded-t-lg border border-b-0 border-overlay-default bg-bg-700 px-3 py-1.5 text-xs text-content-secondary">
              <img src="/favicon-32x32.png" alt="" width={16} height={16} />
              Today · AscendDay
            </span>
          </BrandItem>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Mono: white silhouette (full, and the small notification badge on transparent)</Caption>
        <div className="flex flex-wrap items-end gap-6">
          <BrandItem label="mono">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#07110E]">
              <img src="/brand/mono.svg" alt="" className="h-14 w-14" />
            </span>
          </BrandItem>
          <BrandItem label="notification-badge 96">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#07110E]">
              <img src={NOTIFICATION_BADGE} alt="" className="h-12 w-12" />
            </span>
          </BrandItem>
          <BrandItem label="badge 24 (status bar)">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#07110E]">
              <img src={NOTIFICATION_BADGE} alt="" className="h-6 w-6" />
            </span>
          </BrandItem>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Notification preview (approximate Android look: badge in the status bar and shade header, app icon on the right)</Caption>
        <NotificationPreview />
      </div>

      <div className="space-y-1.5">
        <Caption>Loader mark (AscendLoaderMark): segments light bottom to top, then the whole A; 1.6 s loop</Caption>
        <div className="flex flex-wrap items-end gap-6">
          <BrandItem label="full 96">
            <AscendLoaderMark className="h-24 w-24" />
          </BrandItem>
          <BrandItem label="full 44 (boot)">
            <AscendLoaderMark className="h-11 w-11" />
          </BrandItem>
          <BrandItem label="full 36 (xl)">
            <AscendLoaderMark className="h-9 w-9" />
          </BrandItem>
          <BrandItem label="small 24 (lg)">
            <AscendLoaderMark variant="small" className="h-6 w-6" />
          </BrandItem>
          <BrandItem label="small 12 (sm)">
            <AscendLoaderMark variant="small" className="h-3 w-3" />
          </BrandItem>
        </div>
      </div>
    </div>
  );
}

function TypographyDemo() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>Page title (Instrument Serif, only here, the page’s one hero number and the auth welcome) + subtitle</Caption>
        <h3 className="page-title">Dashboard</h3>
        <p className="page-subtitle">Every summit reveals higher peaks. Consistent daily progress compounds.</p>
      </div>

      <div className="space-y-1.5">
        <Caption>Type roles (Geist)</Caption>
        <div className="space-y-2 rounded-xl border border-overlay-subtle p-4">
          <p className="section-title">.section-title, the heading of a block</p>
          <p className="item-name">.item-name, the name of a thing in a list</p>
          <p className="text-sm text-content-secondary">
            Body text-sm: <span className="figure text-content-primary">.figure 1,247 pts</span> keeps digits even-width.
          </p>
          <p className="stat-label">.stat-label, the small caption over a number</p>
          <p className="label">.label, a form label</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Numbers</Caption>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="stat-label">Hero number (font-serif)</p>
            <p className="mt-1 font-serif text-5xl leading-none tabular-nums text-content-primary">1,247</p>
          </div>
          <div>
            <p className="stat-label">Stat (figure)</p>
            <p className="mt-1 figure text-3xl leading-none text-content-primary">82%</p>
          </div>
          <div>
            <p className="stat-label">Live countdown (font-mono, only timers and codes)</p>
            <p className="mt-1 font-mono text-3xl leading-none tabular-nums text-content-primary">04:59</p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Caption>Type scale tokens</Caption>
        {['text-3xs', 'text-2xs', 'text-micro', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'].map((size) => (
          <p key={size} className={`${size} text-content-secondary`}>
            {size}: The quick brown fox 0123456789
          </p>
        ))}
      </div>
    </div>
  );
}

export function FoundationsGroup() {
  return (
    <>
      <Section id="typography">
        <TypographyDemo />
      </Section>

      <Section id="badges">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Caption>size="xs" shape="pill"</Caption>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone} size="xs" shape="pill">
                  {tone}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Caption>size="sm" shape="pill"</Caption>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone} size="sm" shape="pill">
                  {tone}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Caption>size="sm" shape="tag"</Caption>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone} size="sm" shape="tag">
                  {tone}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="brand">
        <BrandDemo />
      </Section>
    </>
  );
}
