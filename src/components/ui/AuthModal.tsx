import { useState } from 'react';
import { Dialog } from './primitives';
import { AppState } from '@/types';
import { AuthPanel, AuthPanelMode, authPanelTitle } from './AuthPanel';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Called as the success screen starts; the parent keeps the modal open until onClose. */
  onAuthSuccess?: () => void;
  guestState: AppState;
}

export function AuthModal({ open, onClose, onAuthSuccess, guestState }: AuthModalProps) {
  const isAnonymousUser = Boolean(guestState.currentUser?.isAnonymous);
  const isAuthenticated = Boolean(guestState.currentUser);

  // 'choice' is the mandatory landing screen for unauthenticated visitors
  const [mode, setMode] = useState<AuthPanelMode>('choice');

  // Set the default screen as the modal opens (during render, so the first frame is right).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (isAnonymousUser) setMode('upgrade');
      else if (!isAuthenticated) setMode('choice');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      preventClose={!isAuthenticated}
      title={authPanelTitle(mode)}
      maxWidth="max-w-md"
    >
      <AuthPanel
        mode={mode}
        onModeChange={setMode}
        active={open}
        onAuthSuccess={onAuthSuccess}
        onDone={onClose}
        guestState={guestState}
      />
    </Dialog>
  );
}
