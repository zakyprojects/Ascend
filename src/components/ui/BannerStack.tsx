import { OfflineBanner, useConnectionStatus } from './OfflineBanner';
import { TimezoneWaitBanner } from './TimezoneWaitBanner';
import { useTimezoneWait } from '@/lib/useTimezoneWait';
import { UpdateBanner, useUpdateAvailable } from './UpdateBanner';

/**
 * The app's one banner slot, in the page flow above the shell (never fixed over the phone header
 * or the page title). One banner at a time: Offline > Back online > New version > Timezone wait.
 */
export function BannerStack() {
  const connection = useConnectionStatus();
  const hasUpdate = useUpdateAvailable();
  const timezoneWait = useTimezoneWait();

  let banner: JSX.Element | null = null;
  if (connection !== 'online') banner = <OfflineBanner status={connection} />;
  else if (hasUpdate) banner = <UpdateBanner />;
  else if (timezoneWait) banner = <TimezoneWaitBanner wait={timezoneWait} />;

  if (!banner) return null;
  return (
    <div className="shrink-0 flex justify-center px-4 pt-[calc(0.5rem_+_env(safe-area-inset-top))] pb-2 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))]">
      {banner}
    </div>
  );
}
