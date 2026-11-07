import { useState } from 'react';
import { Button, Dialog, Form, Input, NumberField, Switch, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { LogoutConfirmModal } from '@/components/ui/LogoutConfirmModal';
import { GuestLogoutWarningModal } from '@/components/ui/GuestLogoutWarningModal';
import { RenameDialog } from '@/components/ui/RenameDialog';
import { NotificationCenter } from '@/components/ui/NotificationCenter';
import { useToast } from '@/components/ui/Toast';
import { FocusLogEditDialog } from '@/components/pfc/FocusLogEditDialog';
import { EmotionNoteDialog } from '@/components/pfc/EmotionNoteDialog';
import { DecisionFormDialog } from '@/components/pfc/DecisionFormDialog';
import { MOODS, MoodBadge, MoodPicker } from '@/components/journal/moods';
import { HABIT_NAME_MAX } from '@/lib/itemEdits';
import { todayKey } from '@/lib/dates';
import { trustedNowMs } from '@/lib/clock';
import type { DecisionLog, EmotionLog, FocusSessionLog, Mood } from '@/types';
import { Caption, Section } from './shared';
import { demoNotifications, useFakeNotificationStore } from './fakes';
import { wait } from './util';

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/** A form dialog the way every app form dialog works: Form + footer submit, dirty guard, async save. */
function FormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useFormController();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(10);
  const [failSave, setFailSave] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-dialogs start empty each time they open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setGoal(10);
    }
  }

  const form = useUnsavedChanges(open, [name, goal]);
  const cancel = () => form.confirmDiscard(onClose);

  const submit = async () => {
    setSaving(true);
    try {
      await wait(900);
      if (failSave) throw new Error('fail');
      onClose();
    } catch {
      controller.showError('Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      preventClose={saving}
      title="Add goal"
      description="Type something, then press Esc, the backdrop or Cancel: it asks Discard changes?"
      footer={
        <>
          <button type="button" onClick={cancel} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="gallery-dialog-form" disabled={saving} className="btn-primary">
            {saving && <AscendLoadingIndicator size="sm" />}
            Add goal
          </button>
        </>
      }
    >
      <Form id="gallery-dialog-form" controller={controller} onSubmit={submit} className="space-y-4">
        <Input id="gallery-dialog-name" label="Goal name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="off" />
        <NumberField id="gallery-dialog-goal" label="Target" hint="Saves for a moment; the dialog can’t close while it saves." value={goal} onValueChange={setGoal} required min={1} />
        <label className="flex items-center gap-3 text-sm text-content-secondary">
          <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
          Make the save fail (stays open with the reason)
        </label>
      </Form>
    </Dialog>
  );
}

function DialogDemo() {
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [nestedAOpen, setNestedAOpen] = useState(false);
  const [nestedBOpen, setNestedBOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
          Form dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
          Confirm delete
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLongOpen(true)}>
          Long scrolling dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLockedOpen(true)}>
          preventClose dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setNestedAOpen(true)}>
          Nested dialogs
        </Button>
      </div>

      <FormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete habit?"
        itemName="Drink 2 litres of water"
        onConfirm={async () => {
          await wait(800);
          setConfirmOpen(false);
        }}
      />

      <Dialog
        open={longOpen}
        onClose={() => setLongOpen(false)}
        title="Long scrolling dialog"
        description="Only the body scrolls; the footer stays pinned."
        footer={
          <button type="button" className="btn-primary" onClick={() => setLongOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-sm text-content-secondary">
              {`Filler paragraph ${i + 1} - scroll test.`}
            </p>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={lockedOpen}
        onClose={() => setLockedOpen(false)}
        title="preventClose dialog"
        description="No X, no Escape, no backdrop close (used while a save runs)."
        preventClose
        footer={
          <button type="button" className="btn-danger-solid" onClick={() => setLockedOpen(false)}>
            Close me
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedAOpen}
        onClose={() => setNestedAOpen(false)}
        title="Nested A"
        description="Nested dialog A is open."
        footer={
          <button type="button" className="btn-primary" onClick={() => setNestedBOpen(true)}>
            Open B
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedBOpen}
        onClose={() => setNestedBOpen(false)}
        title="Nested B"
        description="Press Escape: only B should close. Press it again: A closes."
        footer={
          <button type="button" className="btn-secondary" onClick={() => setNestedBOpen(false)}>
            Close B
          </button>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}

function LogoutDemo() {
  const [open, setOpen] = useState<'user' | 'guest' | null>(null);
  const [busy, setBusy] = useState(false);
  const { showInfoToast } = useToast();
  const fakeLogout = async () => {
    setBusy(true);
    await wait(900);
    setBusy(false);
    setOpen(null);
    showInfoToast('Not signed out', 'The Gallery only waits; nobody is signed out.');
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen('user')}>
        Log out (account)
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen('guest')}>
        Log out (guest)
      </Button>
      <LogoutConfirmModal open={open === 'user'} onClose={() => setOpen(null)} onConfirm={fakeLogout} isLoggingOut={busy} />
      <GuestLogoutWarningModal
        open={open === 'guest'}
        onClose={() => setOpen(null)}
        onSaveProgressFirst={() => {
          setOpen(null);
          showInfoToast('Create account', 'The Gallery never opens sign-up.');
        }}
        onLogoutAnyway={fakeLogout}
        isLoggingOut={busy}
      />
    </div>
  );
}

const TAKEN_NAMES = ['read 20 pages', 'drink 2 litres of water'];

function RenameDemo() {
  const [name, setName] = useState('Morning walk');
  const [open, setOpen] = useState(false);
  const [failSave, setFailSave] = useState(false);
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="item-name text-sm">{name}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setRun((n) => n + 1);
            setOpen(true);
          }}
        >
          Rename
        </Button>
        <label className="flex items-center gap-2 text-xs text-content-muted">
          <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
          Make the save fail
        </label>
      </div>
      <p className="text-micro text-content-muted">Try “Read 20 pages” (taken), an empty name, or close with changes (Discard changes?).</p>
      <RenameDialog
        key={run}
        open={open}
        onClose={() => setOpen(false)}
        title="Rename habit"
        description="Its streak, history and points stay as they are."
        label="Habit name"
        initialName={name}
        inputId="gallery-rename-input"
        maxLength={HABIT_NAME_MAX}
        validate={(next) => {
          const clean = next.trim().toLowerCase();
          if (!clean) return 'Enter a name.';
          if (TAKEN_NAMES.includes(clean)) return 'You already have a habit with this name.';
          return null;
        }}
        onSave={(next) => {
          if (failSave) throw new Error('Couldn’t save. Check your connection and try again.');
          setName(next.trim());
        }}
      />
    </div>
  );
}

const MINUTE = 60 * 1000;

function PfcEditsDemo() {
  const { showSuccessToast } = useToast();
  const [focusLog, setFocusLog] = useState<FocusSessionLog>(() => ({
    id: 'gallery-focus-1',
    date: todayKey(),
    taskName: 'Write the Gallery report',
    durationMinutes: 50,
    plannedMinutes: 50,
    pointsAwarded: 6,
    reflection: 'Got through the first half; the split went well.',
    createdAt: new Date(trustedNowMs() - 20 * MINUTE).toISOString(),
    startedAt: new Date(trustedNowMs() - 70 * MINUTE).toISOString(),
  }));
  const [emotion, setEmotion] = useState<EmotionLog>(() => ({
    id: 'gallery-emotion-1',
    date: new Date(trustedNowMs() - 3 * 60 * MINUTE).toISOString(),
    emotion: 'Anxious',
    intensity: 6,
    context: 'Before the exam results came out.',
    pointsAwarded: 2,
    createdAt: new Date(trustedNowMs() - 3 * 60 * MINUTE).toISOString(),
  }));
  const [decision, setDecision] = useState<DecisionLog>(() => ({
    id: 'gallery-decision-1',
    title: 'Study in the mornings',
    rationale: 'I focus better before noon.',
    expectedOutcome: 'Two extra focused hours a day.',
    revisitDate: todayKey(),
    isReflected: true,
    reflection: 'It worked on weekdays; weekends need another plan.',
    createdAt: new Date(trustedNowMs() - 7 * 24 * 60 * MINUTE).toISOString(),
  }));
  const [open, setOpen] = useState<'focus' | 'emotion' | 'decision' | null>(null);
  const [fail, setFail] = useState(false);
  const save = async () => {
    await wait(600);
    if (fail) throw new Error('Couldn’t save. Check your connection and try again.');
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen('focus')}>
          Edit focus session
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen('decision')}>
          Edit decision (reflected)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen('emotion')}>
          Edit emotion note
        </Button>
        <label className="flex items-center gap-2 text-xs text-content-muted">
          <Switch checked={fail} onChange={() => setFail((v) => !v)} label="Make the save fail" />
          Make the save fail
        </label>
      </div>
      <ul className="space-y-1 text-xs text-content-muted">
        <li>
          Focus: <span className="text-content-secondary">{focusLog.taskName}</span> · {focusLog.reflection || 'no note'}
        </li>
        <li>
          Decision: <span className="text-content-secondary">{decision.title}</span> · {decision.reflection}
        </li>
        <li>
          Emotion: <span className="text-content-secondary">{emotion.emotion}</span> · {emotion.context || 'no note'}
        </li>
      </ul>
      <FocusLogEditDialog
        log={open === 'focus' ? focusLog : null}
        onClose={() => setOpen(null)}
        onSave={async (taskName, reflection) => {
          await save();
          setFocusLog((l) => ({ ...l, taskName, reflection }));
          showSuccessToast('Session updated');
        }}
      />
      <EmotionNoteDialog
        log={open === 'emotion' ? emotion : null}
        onClose={() => setOpen(null)}
        onSave={async (context) => {
          await save();
          setEmotion((l) => ({ ...l, context }));
          showSuccessToast('Note updated');
        }}
      />
      <DecisionFormDialog
        open={open === 'decision'}
        onClose={() => setOpen(null)}
        onSave={() => undefined}
        editing={open === 'decision' ? decision : null}
        onSaveEdit={async (_id, changes) => {
          await save();
          setDecision((d) => ({ ...d, ...changes }));
          showSuccessToast('Decision updated');
        }}
      />
    </div>
  );
}

function MoodPickerDemo() {
  const [mood, setMood] = useState<Mood>(MOODS[0].value);
  return (
    <div className="space-y-3">
      <MoodPicker value={mood} onChange={setMood} />
      <div className="flex flex-wrap items-center gap-2">
        <Caption>MoodBadge</Caption>
        {MOODS.map((m) => (
          <MoodBadge key={m.value} mood={m.value} />
        ))}
      </div>
    </div>
  );
}

function NotificationCenterDemo() {
  const filled = useFakeNotificationStore();
  const empty = useFakeNotificationStore(() => []);
  const loading = useFakeNotificationStore(() => [], 'loading');
  const failed = useFakeNotificationStore(() => [], 'failed');
  const read = useFakeNotificationStore(() => demoNotifications().map((n) => ({ ...n, read: true })));
  const bells = [
    { label: 'Unread + read', fake: filled, compact: false },
    { label: 'Compact', fake: filled, compact: true },
    { label: 'All read', fake: read, compact: false },
    { label: 'Empty', fake: empty, compact: false },
    { label: 'Loading', fake: loading, compact: false },
    { label: 'Failed (Retry)', fake: failed, compact: false },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-6">
        {bells.map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1.5">
            <NotificationCenter store={b.fake.store} compact={b.compact} align="left" />
            <span className="text-micro text-content-muted">{b.label}</span>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={() => filled.reset()}>
        Bring the notices back
      </Button>
    </div>
  );
}

export function DialogsGroup() {
  return (
    <>
      <Section id="dialogs">
        <DialogDemo />
      </Section>

      <Section id="logout">
        <LogoutDemo />
      </Section>

      <Section id="rename">
        <RenameDemo />
      </Section>

      <Section id="pfc-edit">
        <PfcEditsDemo />
      </Section>

      <Section id="mood-picker">
        <MoodPickerDemo />
      </Section>

      <Section id="notification-center">
        <NotificationCenterDemo />
      </Section>
    </>
  );
}
