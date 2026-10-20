import { useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button, cx, FOCUS_RING } from '@/components/ui/primitives';
import { markLegalNoticeDone, shouldShowLegalNotice } from '@/lib/legal';
import { pathForLegalRoute } from '@/lib/routes';

const LINK_CLASS = cx('font-medium text-brand-text hover:underline underline-offset-2 rounded', FOCUS_RING);

/**
 * A one-time note for accounts from before the Terms and Privacy Policy existed (nothing to
 * accept). Closing it or opening either page retires it for this account on this device.
 */
export function LegalNoticeCard({ userId, createdAt }: { userId: string; createdAt: string | undefined }) {
  const [show, setShow] = useState(() => shouldShowLegalNotice(userId, createdAt));
  if (!show) return null;

  const done = () => {
    markLegalNoticeDone(userId);
    setShow(false);
  };

  return (
    <div className="p-4 rounded-xl border border-primary-500/20 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0 text-brand-text">
        <FileText size={18} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-content-secondary">Ascend now has Terms and a Privacy Policy</p>
        <p className="text-xs text-content-muted">
          They explain the rules and what happens with your data. Read the{' '}
          <a href={pathForLegalRoute('terms')} target="_blank" rel="noopener noreferrer" onClick={done} className={LINK_CLASS}>
            Terms
          </a>{' '}
          and the{' '}
          <a href={pathForLegalRoute('privacy')} target="_blank" rel="noopener noreferrer" onClick={done} className={LINK_CLASS}>
            Privacy Policy
          </a>
          .
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={done} aria-label="Dismiss" title="Close" className="-mr-2 -mt-2">
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
