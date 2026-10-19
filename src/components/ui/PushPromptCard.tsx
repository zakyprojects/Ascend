import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { toUserMessage } from '@/lib/userMessage';
import { enablePush, markPushPromptDone, shouldOfferPush } from '@/lib/push';

/**
 * A one-time offer to turn on push on this device (push is opt-in per device and easy to miss in
 * Settings). Shown only when shouldOfferPush says so; turning push on, answering the browser's
 * question either way, or closing the card retires it on this device for good.
 */
export function PushPromptCard({ userId }: { userId: string }) {
  const [offer, setOffer] = useState(false);
  const { showSuccessToast, showErrorToast } = useToast();
  const { isLoading, executeFn } = useAsyncAction();

  useEffect(() => {
    let active = true;
    shouldOfferPush()
      .then((next) => {
        if (active) setOffer(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  if (!offer) return null;

  const dismiss = () => {
    markPushPromptDone();
    setOffer(false);
  };

  const turnOn = () =>
    executeFn(async () => {
      try {
        const status = await enablePush(userId);
        dismiss();
        if (status === 'on') showSuccessToast('Notifications are on', "You'll get them on this device even when Ascend is closed.");
      } catch (err) {
        console.error('[push] turn on from the card failed:', err);
        showErrorToast("Couldn't turn on notifications", toUserMessage(err, 'Please try again.'));
      }
    });

  return (
    <div className="p-4 rounded-xl border border-primary-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3 w-full sm:w-auto">
        <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0 text-brand-text">
          <Bell size={18} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-content-secondary">Turn on notifications on this device</p>
          <p className="text-xs text-content-muted">Get partner nudges and your evening reminder even when Ascend is closed.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss" title="Not now" className="-mr-2 -mt-2 sm:hidden">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-1 w-full sm:w-auto shrink-0">
        <Button onClick={turnOn} loading={isLoading} className="min-h-11 text-xs flex-1 sm:flex-none">
          Turn on
        </Button>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss" title="Not now" className="hidden sm:inline-flex">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
