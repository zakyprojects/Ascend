import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { Button, Card, FieldErrorBubble, Form, FormAlert, Input, Select, Textarea, cx, useFormController } from '@/components/ui/primitives';
import { FOCUS_RING, TAP_TARGET } from '@/components/ui/primitives/shared';
import { NAV_DASHBOARD, NAV_GROUPS, NAV_SETTINGS, getViewLabel } from '@/components/nav/navConfig';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { pageLinkProps } from '@/lib/pageLink';
import {
  FeedbackKind,
  IMPACT_OPTIONS,
  MAX_SCREENSHOTS,
  SEVERITY_OPTIONS,
  Screenshot,
  feedbackContext,
  newFeedbackRef,
  prepareScreenshot,
  submitFeedback,
} from '@/lib/feedback';
import { trustedNowMs } from '@/lib/clock';

interface FeedbackViewProps {
  kind: FeedbackKind;
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
  bug: {
    title: 'Report a bug',
    subtitle: 'Tell us what broke. Every report is read.',
    other: { view: 'suggest-idea' as View, label: 'Have an idea instead?' },
    titlePlaceholder: 'e.g. Habit streak resets after midnight',
    send: 'Send report',
  },
  idea: {
    title: 'Suggest an idea',
    subtitle: 'What would make Ascend better for you?',
    other: { view: 'report-bug' as View, label: 'Found a bug instead?' },
    titlePlaceholder: 'e.g. Weekly summary email',
    send: 'Send idea',
  },
} as const;

interface ChoiceGroupProps {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string; hint: string }>;
  value: string;
  onChange: (value: string) => void;
}

/** Native radios (keyboard and screen readers for free) drawn as three cards. */
function ChoiceGroup({ legend, name, options, value, onChange }: ChoiceGroupProps) {
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

export function FeedbackView({ kind, store, fromView, onNavigate }: FeedbackViewProps) {
  const copy = COPY[kind];
  const currentUser = store.state.currentUser;
  const startArea = fromView === 'report-bug' || fromView === 'suggest-idea' ? OTHER_AREA : getViewLabel(fromView);

  const [title, setTitle] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const context = useMemo(
    () => feedbackContext(currentUser ? { uid: currentUser.uid, isAnonymous: currentUser.isAnonymous } : null),
    [currentUser]
  );

  const fields: Record<string, string> =
    kind === 'bug'
      ? { whatHappened, steps, expected, severity, area }
      : { problem, idea, impact, area };
  const isValid = title.trim() !== '' && (kind === 'bug' ? whatHappened.trim() !== '' : idea.trim() !== '');

  useUnsavedChanges(sentRef === null, [title, fields, screenshots.map((s) => s.id)]);

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
    if (!isValid || isSending) return; // the required fields say why
    setIsSending(true);
    try {
      const ref = await submitFeedback({
        kind,
        ref: newFeedbackRef(),
        title: title.trim(),
        fields: { ...fields, area: area === OTHER_AREA ? '' : area },
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
    setScreenshots([]);
    setScreenshotError(null);
    sendIssues.clear();
    setStartedAt(trustedNowMs());
    setSentRef(null);
  };

  const backView: View = fromView === 'report-bug' || fromView === 'suggest-idea' ? 'dashboard' : fromView;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <div className="page-header">
        <div>
          <h1 className="page-title">{copy.title}</h1>
          <p className="page-subtitle">{copy.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <a
            {...pageLinkProps(copy.other.view, onNavigate)}
            className={cx('inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline rounded-lg', FOCUS_RING)}
          >
            {copy.other.label}
          </a>
        </div>
      </div>

      {sentRef ? (
        <Card padding="lg" className="enter-item">
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/15 text-brand-text">
              <Check size={24} />
            </span>
            <h2 className="section-title">Thanks, it’s sent</h2>
            <p className="text-sm text-content-secondary max-w-sm">
              Your reference is <span className="figure font-semibold text-content-primary">{sentRef}</span>. Mention it
              if you write to us about this.
            </p>
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
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={copy.titlePlaceholder}
              maxLength={120}
              required
            />

            {kind === 'bug' ? (
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
                <ChoiceGroup legend="How bad is it?" name="severity" options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />
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
                  placeholder="What should Ascend do?"
                  rows={4}
                  maxLength={4000}
                  required
                />
                <ChoiceGroup legend="How useful would it be?" name="impact" options={IMPACT_OPTIONS} value={impact} onChange={setImpact} />
              </>
            )}

            <Select label="Which page?" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </Select>

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
              </p>
              <p className="mt-1 text-xs text-content-muted">None of your habits, journal or points.</p>
            </div>

            <FormAlert />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={isSending} disabled={isSending || isPreparing}>
                {copy.send}
              </Button>
            </div>
          </Card>
        </Form>
      )}
    </div>
  );
}
