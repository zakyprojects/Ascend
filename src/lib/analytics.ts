/**
 * Page-view counts with Vercel Web Analytics: production builds only, so local and studio runs
 * send nothing. Cookieless and anonymous: no account id, no custom events, no session replay.
 *
 * URLs lose their query and hash before they are sent (sign-in links carry tokens there), the
 * same rule as the crash reports. The script is served from our own origin (/_vercel/insights),
 * so the Content-Security-Policy needs no new source.
 */
import { inject } from '@vercel/analytics';

export function installAnalytics(): void {
  if (!import.meta.env.PROD) return;
  inject({
    mode: 'production',
    beforeSend: (event) => {
      const url = new URL(event.url);
      return { ...event, url: url.origin + url.pathname };
    },
  });
}
