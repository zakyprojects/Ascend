import { useState } from 'react';
import {
  Button,
  Dialog,
  FieldErrorBubble,
  FieldGroup,
  FieldRow,
  Form,
  FormAlert,
  Input,
  NumberField,
  Select,
  SlidingPill,
  Switch,
  Textarea,
  ToolbarSelect,
  cx,
  useFormController,
} from '@/components/ui/primitives';
import { StatusSelect } from '@/components/projects/ItemCard';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { Caption, Section } from './shared';
import { wait } from './util';

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const KINDS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

/** The one error look: a bubble under the field, one problem at a time (Form + validate + showError). */
function FormErrorsDemo() {
  const controller = useFormController();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [kind, setKind] = useState('');
  const [failSave, setFailSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  const submit = async () => {
    setSaving(true);
    await wait(700);
    setSaving(false);
    if (failSave) {
      controller.showError('Couldn’t save. Check your connection and try again.');
      return;
    }
    setSaved((n) => n + 1);
  };

  return (
    <Form
      controller={controller}
      alert="manual"
      onSubmit={submit}
      validate={() =>
        name.trim().toLowerCase() === 'read'
          ? { message: 'You already have a habit with this name.', field: 'gallery-form-name' }
          : !kind
            ? { message: 'Choose an option.', field: 'gallery-form-kind' }
            : null
      }
      className="space-y-4"
    >
      <FieldRow>
        <Input
          id="gallery-form-name"
          label="Habit name"
          hint="Try “Read” for a name that is taken."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          autoComplete="off"
        />
        <NumberField
          id="gallery-form-minutes"
          label="Minutes"
          value={minutes}
          onValueChange={setMinutes}
          required
          min={1}
          max={600}
        />
      </FieldRow>
      <FieldGroup id="gallery-form-kind" label="How often">
        <div className="relative isolate flex flex-wrap items-center gap-1.5">
          {kind && <SlidingPill active={kind} className="rounded-lg border border-overlay-strong bg-overlay-default" />}
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              data-pill-id={k.id}
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={cx(
                'rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition-colors',
                kind === k.id ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </FieldGroup>
      <Textarea id="gallery-form-note" label="Note" optional rows={2} />
      <label className="flex items-center gap-3 text-sm text-content-secondary">
        <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
        Make the save fail (form-wide bubble above the button)
      </label>
      <FormAlert />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Save
        </Button>
        {saved > 0 && <span className="text-xs text-success-text">Saved {saved}×</span>}
      </div>
    </Form>
  );
}

function FieldsDemo() {
  const [count, setCount] = useState(30);
  return (
    <div className="space-y-4">
      <Input label="Username" hint="3–20 letters, numbers, _ or -." defaultValue="ascend_user" />
      <Input label="Email address" error="Enter a valid email address." defaultValue="invalid-email" />
      <Input label="Disabled field" disabled defaultValue="Disabled value" />
      <Input aria-label="Search items" placeholder="Search with aria-label only..." defaultValue="search query" />
      <FieldRow>
        <Select label="Role" defaultValue="member">
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </Select>
        <NumberField label="Pages a day" hint="Clear it and type: it keeps your text." value={count} onValueChange={setCount} min={1} />
      </FieldRow>
      <Textarea label="Biography" optional defaultValue="Write a short summary..." />
      <div className="space-y-2">
        <Caption>FieldErrorBubble on its own (outside a form): attached, then form-wide</Caption>
        <FieldErrorBubble message="Pick an avatar." />
        <FieldErrorBubble message="Couldn’t save. Try again." attached={false} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdowns (ui/primitives/Select.tsx: the app's one dropdown, never the browser's picker)
// ---------------------------------------------------------------------------

const DEMO_PAGES = [
  'Dashboard', 'Daily habits', 'Bad habits', 'Weekly goals', 'Projects & Goals', 'Journal', 'Exercise', 'Reading',
  'Skills', 'Recovery', 'Deep Focus', 'Emotions', 'Decisions', 'Time Tracker', 'Plans', 'Partners', 'Brain lessons',
  'Leagues', 'Ranks', 'Settings', 'Other',
];

/** Required select with a placeholder in a Form: Save with nothing chosen shows "Choose an option." */
function DropdownFormDemo() {
  const [skill, setSkill] = useState('');
  const [saved, setSaved] = useState('');
  return (
    <Form onSubmit={() => setSaved(skill)} className="space-y-3">
      <Select id="gallery-dd-required" label="Skill" required value={skill} onChange={(e) => setSkill(e.target.value)}>
        <option value="" disabled>Choose a skill</option>
        <option value="guitar">Guitar</option>
        <option value="chess">Chess</option>
        <option value="drawing">Drawing</option>
      </Select>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">Save</Button>
        {saved && <span className="text-xs text-success-text">Saved {saved}</span>}
      </div>
    </Form>
  );
}

/** A select in a dialog: Escape and an outside tap close only the list, never the dialog or "Discard changes?". */
function DropdownDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [emotion, setEmotion] = useState('calm');
  const [note, setNote] = useState('');
  const form = useUnsavedChanges(open, [emotion, note]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title="Select in a dialog"
      description="Open the list, then press Esc or tap outside it: only the list closes."
      footer={
        <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
          Close
        </button>
      }
    >
      <Form onSubmit={onClose} className="space-y-4">
        <Select id="gallery-dd-dialog" label="Emotion" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
          {['Calm', 'Anxious', 'Angry', 'Sad', 'Bored', 'Restless', 'Tired', 'Happy', 'Other…'].map((e) => (
            <option key={e} value={e.toLowerCase()}>{e}</option>
          ))}
        </Select>
        <Select id="gallery-dd-dialog-page" label="Which page?" value="" onChange={() => undefined}>
          <option value="">Not sure</option>
          {DEMO_PAGES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input id="gallery-dd-dialog-note" label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} />
      </Form>
    </Dialog>
  );
}

function DropdownsDemo() {
  const [plain, setPlain] = useState('member');
  const [page, setPage] = useState('');
  const [sort, setSort] = useState('newest');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="space-y-5">
      <FieldRow>
        <Select id="gallery-dd-default" label="Default" value={plain} onChange={(e) => setPlain(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer" disabled>Viewer (disabled option)</option>
        </Select>
        <Select id="gallery-dd-disabled" label="Disabled" hint="Locked after the first log." disabled value="pages" onChange={() => undefined}>
          <option value="pages">Pages</option>
          <option value="minutes">Minutes</option>
        </Select>
      </FieldRow>
      <FieldRow>
        <Select id="gallery-dd-long" label="Long scrolling list" hint="21 options; near the bottom of the screen it opens upward." value={page} onChange={(e) => setPage(e.target.value)}>
          <option value="" disabled>Choose a page</option>
          {DEMO_PAGES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select id="gallery-dd-error" label="Error state" error="Choose an option." value="" onChange={() => undefined}>
          <option value="" disabled>Choose a habit</option>
          <option value="read">Read 10 pages</option>
          <option value="walk">Walk after lunch</option>
        </Select>
      </FieldRow>
      <Select id="gallery-dd-empty" label="Empty (only a placeholder)" value="" onChange={() => undefined}>
        <option value="" disabled>No skills yet</option>
      </Select>
      <div className="space-y-2">
        <Caption>Required with a placeholder, in a Form: press Save with nothing chosen</Caption>
        <DropdownFormDemo />
      </div>
      <div className="space-y-2">
        <Caption>ToolbarSelect: page filter/sort row (as wide as its longest option)</Caption>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ToolbarSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} wrapperClassName="flex-1 sm:flex-none sm:w-44">
            <option value="all">All categories</option>
            <option value="habits">Habits</option>
            <option value="fitness">Fitness</option>
            <option value="mind">Mind</option>
          </ToolbarSelect>
          <ToolbarSelect aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option>
            <option value="popular">Most popular</option>
            <option value="az">A to Z</option>
          </ToolbarSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Caption>StatusSelect: the compact status picker in a card footer</Caption>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-overlay-subtle p-3">
          <StatusSelect label="Status of the demo project" value={status} onChange={setStatus}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed" disabled>Completed (finish the tasks first)</option>
          </StatusSelect>
          <StatusSelect label="Locked status" value="active" onChange={() => undefined} disabled>
            <option value="active">Active (locked)</option>
          </StatusSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Caption>Inside a dialog</Caption>
        <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <DropdownDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch, progress, segmented, disclosure
// ---------------------------------------------------------------------------

export function FormsGroup() {
  return (
    <>
      <Section id="fields">
        <FieldsDemo />
      </Section>

      <Section id="dropdowns">
        <DropdownsDemo />
      </Section>

      <Section id="form-errors">
        <FormErrorsDemo />
      </Section>
    </>
  );
}
