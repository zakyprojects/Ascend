import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { Button, Card, FieldErrorBubble, Form, FormAlert, Input, Select, Textarea, cx, useFocusOnRender, useFormController } from '@/components/ui/primitives';
import { FOCUS_RING, TAP_TARGET } from '@/components/ui/primitives/shared';
import { NAV_DASHBOARD, NAV_GROUPS, NAV_SETTINGS, getViewLabel, isFeedbackView } from '@/components/nav/navConfig';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { pageLinkProps } from '@/lib/pageLink';
import {
  FEEDBACK_KINDS,
  FeedbackKind,
  IMPACT_OPTIONS,
  MAX_SCREENSHOTS,
  RATING_VALUES,
  SEVERITY_OPTIONS,
  Screenshot,
  clearPendingFeedbackStart,
  feedbackContext,
  newFeedbackRef,
  pendingFeedbackStart,
  prepareScreenshot,
  submitFeedback,
} from '@/lib/feedback';
import { trustedNowMs } from '@/lib/time/clock';

interface FeedbackViewProps {
  /** The choice the form opens on: none on /feedback, bug on /report-bug, idea on /suggest-idea. */
  initialKind: FeedbackKind | null;
  store: AppStore;
  /** The page the user was on before opening this one. */
  fromView: View;
  onNavigate: (view: View) => void;
}

const OTHER_AREA = 'Other / not sure';
const AREAS = [
  NAV_DASHBOARD.label,
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
  NAV_SETTINGS.label,
  OTHER_AREA,
];

const COPY = {
  bug: { titlePlaceholder: 'e.g. Habit streak resets after midnight', send: 'Send report' },
  idea: { titlePlaceholder: 'e.g. Weekly summary email', send: 'Send idea' },
  other: { titlePlaceholder: '', send: 'Send' },
} as const;

const RATING_WORDS: Record<number, string> = { 1: 'Not well', 2: 'Not great', 3: 'Okay', 4: 'Well', 5: 'Very well' };

interface ChoiceGroupProps {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string; hint: string }>;
  value: string;
  onChange: (value: string) => void;
  /** An optional choice: a second tap on the chosen card clears it (as the rating does). */
  clearable?: boolean;
}

/** Native radios (keyboard and screen readers for free) drawn as three cards. */
function ChoiceGroup({ legend, name, options, value, onChange, clearable = false }: ChoiceGroupProps) {
  return (
    <fieldset>
      <legend className="label block mb-1.5">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              onClick={() => clearable && value === option.value && onChange('')}
              className="peer sr-only"
            />
            <span
              className={cx(
                'flex h-full flex-col rounded-xl border px-3.5 py-2.5 transition-colors',
                'border-overlay-default bg-bg-700 hover:border-overlay-strong',
                'peer-checked:border-primary-500 peer-checked:bg-primary-500/10',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60'
              )}
            >
              <span className="text-sm font-medium text-content-primary">{option.label}</span>
              <span className="text-xs text-content-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Five small buttons (native radios) for the optional private rating. */
function RatingGroup({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <fieldset>
      <legend className="label block mb-1.5">How is AscendDay working for you? (optional)</legend>
      <div className="flex flex-wrap items-center gap-2">
        {RATING_VALUES.map((n) => (
          <label key={n} className="relative cursor-pointer">
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              // A second tap on the chosen number clears it: the rating stays optional.
              onClick={() => value === n && onChange(null)}
              aria-label={`${n} of 5, ${RATING_WORDS[n]}`}
              className="peer sr-only"
            />
            <span
              className={cx(
                'figure flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-medium transition-colors',
                'border-overlay-default bg-bg-700 text-content-secondary hover:border-overlay-strong',
                'peer-checked:border-primary-500 peer-checked:bg-primary-500/10 peer-checked:text-content-primary',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60'
              )}
            >
              {n}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-content-muted">
        1 = not well, 5 = very well. {value ? `${RATING_WORDS[value]}. ` : ''}Private: only used to improve AscendDay,
        never shown publicly.
      </p>
    </fieldset>
  );
}

export function FeedbackView({ initialKind, store, fromView, onNavigate }: FeedbackViewProps) {
  const currentUser = store.state.currentUser;
  const startArea = isFeedbackView(fromView) ? OTHER_AREA : getViewLabel(fromView);
  // Opened from an error card ("Report this": the bug form with the error's words) or a Settings
  // choice; an old address (/report-bug, /suggest-idea) keeps its own choice.
  const [start] = useState(() => {
    const pending = pendingFeedbackStart();
    return pending && (initialKind === null || pending.kind === initialKind) ? pending : null;
  });
  useEffect(() => clearPendingFeedbackStart(), []);
  const startNote = start?.kind === 'bug' ? start.note : undefined;

  const [kind, setKind] = useState<FeedbackKind | null>(start?.kind ?? initialKind);
  const copy = COPY[kind ?? 'other'];
  // Only a signed-in account has an email to reply to (a guest has none).
  const accountEmail = currentUser && !currentUser.isAnonymous ? (currentUser.email ?? '') : '';

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [replyOk, setReplyOk] = useState(false);
  const [whatHappened, setWhatHappened] = useState(startNote ? `The app showed an error:\n${startNote}\n\n` : '');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [severity, setSeverity] = useState('');
  const [problem, setProblem] = useState('');
  const [idea, setIdea] = useState('');
  const [impact, setImpact] = useState('');
  const [area, setArea] = useState(AREAS.includes(startArea) ? startArea : OTHER_AREA);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [isSending, setIsSending] = useState(false);
  const sendIssues = useFormController();
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => trustedNowMs());
  // One ref per report: a retry after a lost reply sends the same ref, so the server finds the
  // issue the first send made instead of filing it twice. Renewed only for a new report.
  const [reportRef, setReportRef] = useState(() => newFeedbackRef());
  const fileInputRef = useRef<HTMLInputElement>(null);
  // After Send the form is replaced: focus (and screen readers) move to the "sent" heading.
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);
  // "Send another" brings the form back: its title takes focus instead of the page.
  const focusNext = useFocusOnRender();

  const context = useMemo(
    () => feedbackContext(currentUser ? { uid: currentUser.uid, isAnonymous: currentUser.isAnonymous } : null),
    [currentUser]
  );

  // Every choice's typing, so switching between them loses nothing.
  const fields: Record<string, string> = { whatHappened, steps, expected, severity, problem, idea, impact, message, area };
  const isValid =
    kind === 'bug'
      ? title.trim() !== '' && whatHappened.trim() !== ''
      : kind === 'idea'
        ? title.trim() !== '' && idea.trim() !== ''
        : kind === 'other' && message.trim() !== '';

  // The typing is kept as a draft (one for the whole form); screenshots are not (they are files,
  // not text). Picking a choice alone is not a change.
  useUnsavedChanges(sentRef === null, [title, fields, screenshots.map((s) => s.id)] as const, {
    key: 'feedback',
    restore: ([draftTitle, draftFields]) => {
      setTitle(draftTitle);
      setWhatHappened(draftFields.whatHappened ?? '');
      setSteps(draftFields.steps ?? '');
      setExpected(draftFields.expected ?? '');
      setSeverity(draftFields.severity ?? '');
      setProblem(draftFields.problem ?? '');
      setIdea(draftFields.idea ?? '');
      setImpact(draftFields.impact ?? '');
      setMessage(draftFields.message ?? '');
      if (AREAS.includes(draftFields.area)) setArea(draftFields.area);
    },
  });

  // Object URLs of the previews are freed when a screenshot is removed and when the page closes.
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;
  useEffect(() => () => screenshotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl)), []);

  const addScreenshots = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setScreenshotError(null);
    const room = MAX_SCREENSHOTS - screenshots.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setScreenshotError(`Up to ${MAX_SCREENSHOTS} screenshots.`);
    setIsPreparing(true);
    const added: Screenshot[] = [];
    for (const file of picked) {
      try {
        added.push(await prepareScreenshot(file));
      } catch (err) {
        setScreenshotError(err instanceof Error ? err.message : "That file couldn't be read.");
      }
    }
    setScreenshots((prev) => [...prev, ...added].slice(0, MAX_SCREENSHOTS));
    setIsPreparing(false);
  };

  const removeScreenshot = (id: string) => {
    setScreenshots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!kind || !isValid || isSending) return; // the required fields say why
    setIsSending(true);
    try {
      const ref = await submitFeedback({
        kind,
        ref: reportRef,
        title: title.trim(),
        fields: { ...fields, area: area === OTHER_AREA ? '' : area },
        rating,
        replyOk: replyOk && accountEmail !== '',
        context,
        screenshots,
        startedAt,
        website,
      });
      setSentRef(ref);
    } catch (err) {
      sendIssues.showError(err instanceof Error ? err.message : 'Something went wrong sending it. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (sentRef) sentHeadingRef.current?.focus();
  }, [sentRef]);

  const resetForm = () => {
    screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    setTitle('');
    setWhatHappened('');
    setSteps('');
    setExpected('');
    setSeverity('');
    setProblem('');
    setIdea('');
    setImpact('');
    setMessage('');
    setRating(null);
    setReplyOk(false);
    setScreenshots([]);
    setScreenshotError(null);
    sendIssues.clear();
    setStartedAt(trustedNowMs());
    setReportRef(newFeedbackRef());
    setSentRef(null);
    focusNext(kind === 'other' ? 'feedback-message' : 'feedback-title');
  };

  const backView: View = isFeedbackView(fromView) ? 'dashboard' : fromView;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <div className="page-header">
        <div>
          <h1 className="page-title">Send feedback</h1>
          <p className="page-subtitle">A bug, an idea, or anything else. Every message is read.</p>
        </div>
      </div>

      {sentRef ? (
        <Card padding="lg" className="enter-item">
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/15 text-brand-text">
              <Check size={24} aria-hidden="true" />
            </span>
            <h2 ref={sentHeadingRef} tabIndex={-1} className="section-title outline-none">
              Thanks, it’s sent
            </h2>
            <p className="text-sm text-content-secondary max-w-sm">
              Your reference is <span className="figure font-semibold text-content-primary">{sentRef}</span>. Mention it
              if you write to me about this.
            </p>
            {replyOk && accountEmail && <p className="text-sm text-content-secondary max-w-sm">I may reply to {accountEmail}.</p>}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={resetForm}>
                Send another
              </Button>
              <Button variant="primary" size="sm" onClick={() => onNavigate(backView)}>
                Back to {getViewLabel(backView)}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Form onSubmit={handleSubmit} controller={sendIssues} alert="manual">
          <Card padding="lg" className="relative space-y-5">
            <ChoiceGroup
              legend="What’s it about?"
              name="feedback-kind"
              options={FEEDBACK_KINDS}
              value={kind ?? ''}
              onChange={(value) => setKind(value as FeedbackKind)}
            />

            {kind === null ? null : kind !== 'other' && (
              <Input
                id="feedback-title"
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={copy.titlePlaceholder}
                maxLength={120}
                required
              />
            )}

            {kind === null ? null : kind === 'other' ? (
              <>
                <Textarea
                  id="feedback-message"
                  label="Your message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What’s on your mind? How is it going, what do you like, what’s missing?"
                  rows={5}
                  maxLength={4000}
                  required
                />
                <RatingGroup value={rating} onChange={setRating} />
              </>
            ) : kind === 'bug' ? (
              <>
                <Textarea
                  label="What happened?"
                  value={whatHappened}
                  onChange={(e) => setWhatHappened(e.target.value)}
                  placeholder="What did you see? Any error message?"
                  rows={4}
                  maxLength={4000}
                  required
                />
                <Textarea
                  label="Steps to see it (optional)"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder={'1. Open Habits\n2. Tick a habit\n3. …'}
                  rows={3}
                  maxLength={4000}
                />
                <Textarea
                  label="What should have happened? (optional)"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  rows={2}
                  maxLength={4000}
                />
                <ChoiceGroup legend="How bad is it?" name="severity" options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} clearable />
              </>
            ) : (
              <>
                <Textarea
                  label="What’s the problem? (optional)"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="What’s hard or missing today?"
                  rows={3}
                  maxLength={4000}
                />
                <Textarea
                  label="Your idea"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="What should AscendDay do?"
                  rows={4}
                  maxLength={4000}
                  required
                />
                <ChoiceGroup legend="How useful would it be?" name="impact" options={IMPACT_OPTIONS} value={impact} onChange={setImpact} clearable />
              </>
            )}

            {kind !== null && (
            <>
            <Select label="Which page?" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </Select>

            {kind !== 'other' && (
            <div>
              <span className="label block mb-1.5">Screenshots (optional)</span>
              <div className="flex flex-wrap gap-2">
                {screenshots.map((shot) => (
                  <div key={shot.id} className="enter-item relative h-20 w-20 overflow-hidden rounded-xl border border-overlay-default">
                    <img src={shot.previewUrl} alt={shot.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(shot.id)}
                      aria-label={`Remove ${shot.name}`}
                      className={cx(
                        'absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-900/80 text-content-primary hover:bg-bg-900',
                        TAP_TARGET,
                        FOCUS_RING
                      )}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {screenshots.length < MAX_SCREENSHOTS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPreparing}
                    className={cx(
                      'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-overlay-strong text-content-muted hover:text-content-primary hover:border-primary-500 transition-colors disabled:cursor-wait disabled:hover:text-content-muted disabled:hover:border-overlay-strong',
                      FOCUS_RING
                    )}
                  >
                    <ImagePlus size={18} />
                    <span className="text-2xs">{isPreparing ? 'Adding…' : 'Add'}</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addScreenshots(e.target.files);
                  e.target.value = '';
                }}
              />
              {screenshotError ? (
                <FieldErrorBubble message={screenshotError} />
              ) : (
                <p className="mt-1.5 text-xs text-content-muted">Up to {MAX_SCREENSHOTS}. They’re resized before sending.</p>
              )}
            </div>
            )}

            {accountEmail && (
              <label htmlFor="feedback-reply" className="flex items-start gap-2.5 py-1 text-sm text-content-secondary cursor-pointer">
                <input
                  id="feedback-reply"
                  type="checkbox"
                  checked={replyOk}
                  onChange={(e) => setReplyOk(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-primary-600"
                />
                <span>
                  Can I reply to you?{' '}
                  <span className="text-content-muted">Sends your account email ({accountEmail}) with this.</span>
                </span>
              </label>
            )}

            {/* Honeypot: off-screen and skipped by keyboard and screen readers; bots fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            <div className="rounded-xl bg-overlay-subtle px-3.5 py-3">
              <p className="text-xs font-medium text-content-secondary">Sent with it</p>
              <p className="mt-1 text-xs text-content-muted">
                {Object.entries(context)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')}
                {replyOk && accountEmail ? ` · Email: ${accountEmail}` : ''}
              </p>
              <p className="mt-1 text-xs text-content-muted">None of your habits, journal or points.</p>
            </div>

            <FormAlert />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={isSending} disabled={isSending || isPreparing}>
                {copy.send}
              </Button>
            </div>
            </>
            )}
          </Card>
        </Form>
      )}
    </div>
  );
}
