import React, { useState } from 'react';
import { Button, cx } from '@/components/ui/primitives';
import { Ember, type EmberProps } from '@/components/auth/Ember';
import { CLIMB_PANEL_BG } from '@/components/auth/ClimbPanel';
import { Caption, Section } from './shared';

type EmberPoseId =
  | 'idle'
  | 'email'
  | 'cover'
  | 'peek'
  | 'account'
  | 'guest'
  | 'google-intent'
  | 'google-leaving'
  | 'submitting'
  | 'success'
  | 'error';

/** Each pose as the auth form would report it; the email and password poses focus the demo field. */
const EMBER_POSES: { id: EmberPoseId; label: string; props: Partial<EmberProps>; field?: 'email' | 'password' }[] = [
  { id: 'idle', label: 'Idle', props: {} },
  { id: 'email', label: 'Email focus', props: { focus: 'email', caret: 0.5 }, field: 'email' },
  { id: 'cover', label: 'Password cover', props: { focus: 'password' }, field: 'password' },
  { id: 'peek', label: 'Password peek', props: { focus: 'password', passwordVisible: true }, field: 'password' },
  { id: 'account', label: 'Create account hover', props: { hoverTrail: 'account' } },
  { id: 'guest', label: 'Guest hover', props: { hoverTrail: 'guest' } },
  { id: 'google-intent', label: 'Google intent', props: { google: 'intent' } },
  { id: 'google-leaving', label: 'Google leaving', props: { google: 'leaving' } },
  { id: 'submitting', label: 'Submitting', props: { phase: 'submitting' } },
  { id: 'success', label: 'Success', props: { phase: 'success' } },
  { id: 'error', label: 'Error shake', props: { upset: true } },
];

/**
 * Ember, the sign-in mascot, on its dark panel in every pose. Picking a pose again replays its
 * one-off (wink at most once per 1.5 s, wave, shake, success hop). Below lg it uses the phone poses.
 */
function EmberDemo() {
  const [poseId, setPoseId] = useState<EmberPoseId>('idle');
  const [formSide, setFormSide] = useState<'left' | 'right'>('right');
  // Picking the same pose again remounts Ember to replay its one-off (a new pose transitions from the
  // last one); the error tick rises on each Error shake press, which shakes without a remount.
  const [run, setRun] = useState(0);
  const [errorTick, setErrorTick] = useState(0);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const pose = EMBER_POSES.find((p) => p.id === poseId) ?? EMBER_POSES[0];

  const pick = (id: EmberPoseId) => {
    const next = EMBER_POSES.find((p) => p.id === id) ?? EMBER_POSES[0];
    if (id === 'error') setErrorTick((tick) => tick + 1);
    // Success leaves the flame flared (its real page moves on); a fresh Ember drops that.
    else if (id === poseId || poseId === 'success') setRun((n) => n + 1);
    setPoseId(id);
    const field = next.field === 'email' ? emailRef.current : next.field === 'password' ? passwordRef.current : null;
    if (field) field.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const props: EmberProps = {
    formSide,
    phase: 'idle',
    focus: null,
    caret: 0,
    passwordVisible: false,
    errorTick,
    upset: false,
    progress: 0,
    hoverTrail: null,
    google: null,
    ...pose.props,
  };

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Ember pose" className="flex flex-wrap gap-1.5">
        {EMBER_POSES.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={poseId === p.id}
            // Keep focus on the demo field (the email and password poses read it).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(p.id)}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              poseId === p.id
                ? 'border-overlay-strong bg-overlay-default text-content-primary'
                : 'border-transparent text-content-muted hover:text-content-secondary'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Caption>Form side (desktop split)</Caption>
        <div role="group" aria-label="Form side" className="flex gap-1.5">
          {(['left', 'right'] as const).map((side) => (
            <Button key={side} size="sm" variant={formSide === side ? 'secondary' : 'ghost'} onMouseDown={(e) => e.preventDefault()} onClick={() => setFormSide(side)}>
              {side === 'left' ? 'Form left (signup)' : 'Form right (login)'}
            </Button>
          ))}
        </div>
      </div>
      <div className={cx('flex flex-col gap-4 lg:items-center', formSide === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row')}>
        <div className="flex justify-center rounded-2xl p-6" style={{ backgroundColor: CLIMB_PANEL_BG }}>
          <Ember key={run} {...props} className="w-24 sm:w-28 lg:w-52" />
        </div>
        {/* Stand-ins for the form's targets: Ember looks at the focused field or the Google button. */}
        <div className="flex-1 space-y-3 max-w-sm">
          <input ref={emailRef} type="email" placeholder="Email (demo)" className="h-11 w-full rounded-xl border border-overlay-default bg-bg-800 px-3 text-sm text-content-primary placeholder:text-content-muted" tabIndex={-1} readOnly />
          <input ref={passwordRef} type="password" placeholder="Password (demo)" className="h-11 w-full rounded-xl border border-overlay-default bg-bg-800 px-3 text-sm text-content-primary placeholder:text-content-muted" tabIndex={-1} readOnly />
          <div data-ember-target="google" className="h-11 rounded-xl border border-overlay-default bg-bg-700 text-sm text-content-primary flex items-center justify-center">
            Continue with Google (demo)
          </div>
        </div>
      </div>
    </div>
  );
}

/** The real rank-up overlay for each step and jump, with its fanfare (whatever the tick choice). */

export function AuthGroup() {
  return (
    <>
      <Section id="ember">
        <EmberDemo />
      </Section>
    </>
  );
}
