import { useState } from 'react';
import {
  ArrowRight,
  Brain,
  BookOpen,
  Check,
  Dumbbell,
  Flame,
  GraduationCap,
  HeartPulse,
  Info,
  RefreshCw,
  Sparkles,
  Trophy,
  Unlink,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { View } from '@/components/AppShell';
import type { Lesson } from '@/types';
import type { AppStore } from '@/lib/store';
import { cx, PageColumns } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/Motion';
import { LESSONS } from '@/lib/lessons';
import { getSeasonNumber, leagueNow } from '@/lib/leagueTime';
import { isLessonReadInSeason } from '@/lib/lessonAwards';
import { LessonReader, pointsLabel } from '@/components/lessons/LessonReader';

type Tone = 'emerald' | 'cyan' | 'purple' | 'rose';

const TONE_TILE: Record<Tone, string> = {
  emerald: 'badge-emerald',
  cyan: 'badge-cyan',
  purple: 'badge-purple',
  rose: 'bg-rose-500/15 text-rose-theme border-rose-500/30',
};

const MECHANISMS: { icon: LucideIcon; tone: Tone; title: string; text: string }[] = [
  {
    icon: Zap,
    tone: 'emerald',
    title: 'Used paths get stronger',
    text: 'Each time you repeat a thought or action, the links between the neurons involved get stronger, so next time it takes less effort.',
  },
  {
    icon: Unlink,
    tone: 'rose',
    title: 'Unused paths fade',
    text: 'Links you stop using weaken over time. This is how bad habits lose their pull once you stop feeding them.',
  },
  {
    icon: RefreshCw,
    tone: 'cyan',
    title: 'Practice speeds the signal',
    text: 'With long practice, the brain wraps busy pathways in myelin, an insulating layer that makes signals faster and smoother.',
  },
];

const USES: { icon: LucideIcon; tone: Tone; title: string; text: string }[] = [
  { icon: Flame, tone: 'emerald', title: 'Build a habit', text: 'Repeat a small action at the same cue until it runs on its own.' },
  { icon: Unlink, tone: 'rose', title: 'Break a bad habit', text: 'Starve the old loop and give the cue a new response.' },
  { icon: GraduationCap, tone: 'cyan', title: 'Learn a skill', text: 'Short, focused practice turns clumsy steps into one smooth move.' },
  { icon: Brain, tone: 'purple', title: 'Change how you think', text: 'Catching and reframing a thought again and again makes the new view the default.' },
  { icon: HeartPulse, tone: 'rose', title: 'Recover', text: 'After a stroke or injury, training lets other areas take over lost functions.' },
  { icon: Sparkles, tone: 'emerald', title: 'Stay sharp with age', text: 'Learning and staying active keep the brain adaptable in later life.' },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Focus fully', text: 'The brain changes most for what it pays attention to. Practise without your phone in reach.' },
  { title: 'Start small, repeat daily', text: 'Five minutes every day beats two hours once a week. Frequency is what wires it in.' },
  { title: 'Stay just past easy', text: 'Aim for practice that is a little hard. Too easy teaches nothing new; too hard makes you quit.' },
  { title: 'Tie it to a cue', text: 'Same time or same trigger each day ("after coffee, I read") so the brain links the two.' },
  { title: 'Sleep 7 or more hours', text: 'Sleep is when the brain keeps the useful links from the day and clears the rest.' },
  { title: 'Move your body', text: 'Exercise raises BDNF, a protein that helps new connections grow. Even a brisk walk helps.' },
  { title: 'Add something new', text: 'New places, skills and people tell the brain to pay attention and stay flexible.' },
  { title: 'Give it a reason', text: 'Effort that matters to you sticks better. Remember why you started when it gets dull.' },
];

const TIMELINE: { when: string; title: string; text: string }[] = [
  {
    when: 'Days 1–7',
    title: 'It feels hard',
    text: 'Links start to strengthen in each session but fade fast. Willpower does most of the work, which is normal.',
  },
  {
    when: 'Weeks 2–4',
    title: 'It gets easier',
    text: 'You need fewer reminders and less push. Skipping now costs you more than doing it.',
  },
  {
    when: 'Around 2 months',
    title: 'It starts to run on its own',
    text: 'In one well-known study, a daily habit took a median of 66 days to feel automatic, anywhere from 18 to 254 days. Simple habits come sooner; harder ones take longer.',
  },
  {
    when: '3 months and on',
    title: 'Keep it going',
    text: 'Brain scans of people learning to juggle showed changes within a few weeks, and the changes shrank after they stopped practising. Keep going so it stays.',
  },
];

const MYTHS: { myth: string; fact: string }[] = [
  { myth: 'I’m too old to change.', fact: 'The brain stays plastic all your life. Change is slower later, not impossible.' },
  { myth: 'One big push will do it.', fact: 'Rewiring comes from many small repeats over weeks, not one intense day.' },
  { myth: 'I missed a day, so it’s ruined.', fact: 'Missing one day barely matters. Just don’t let it become a run of misses.' },
  { myth: 'Some people are just wired that way.', fact: 'Your starting point differs; your ability to change does not.' },
];

const ASCEND_LINKS: { icon: LucideIcon; tone: Tone; title: string; text: string; view: View }[] = [
  { icon: Flame, tone: 'emerald', title: 'Habits', text: 'Daily repeats that strengthen the path.', view: 'habits' },
  { icon: GraduationCap, tone: 'cyan', title: 'Skills', text: 'Track focused practice minutes.', view: 'skills' },
  { icon: Dumbbell, tone: 'rose', title: 'Exercise', text: 'Feed the brain BDNF.', view: 'exercise' },
  { icon: Trophy, tone: 'purple', title: '90-Day League', text: 'A season long enough for change to stick.', view: 'leagues' },
];

function Tile({ icon: Icon, tone, size = 'md' }: { icon: LucideIcon; tone: Tone; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-xl border',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        TONE_TILE[tone]
      )}
    >
      <Icon size={size === 'sm' ? 15 : 18} aria-hidden="true" />
    </span>
  );
}

export function Neuroplasticity({ store, onViewChange }: { store: AppStore; onViewChange?: (view: View) => void }) {
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const season = getSeasonNumber(leagueNow());
  const isRead = (id: string) => isLessonReadInSeason(store.state.readLessonIds, id, season);
  const neuroLessons = LESSONS.filter((l) => l.category === 'Neuroplasticity');
  const nextLesson = (lesson: Lesson) => neuroLessons[neuroLessons.findIndex((l) => l.id === lesson.id) + 1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Neuroplasticity</h1>
        <p className="page-subtitle">How your brain rewires itself, and how to make it work for you.</p>
      </div>

      <PageColumns
        lead={
          <>
            <Reveal index={0} className="card p-5 sm:p-6">
              <Tile icon={Brain} tone="purple" />
              <h2 className="section-title mt-4">Your brain is not fixed.</h2>
              <p className="mt-2 text-sm leading-relaxed text-content-tertiary">
                Scientists once thought the adult brain stopped changing after childhood. It doesn’t. Every habit you repeat, every
                skill you practise and even the thoughts you keep having physically reshape it.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-content-tertiary">
                This is <span className="font-medium text-purple-hierarchy">neuroplasticity</span>: the brain’s ability to build new
                connections and drop old ones, at any age. It means who you are today is a starting point, not a limit.
              </p>
              <blockquote className="mt-4 border-l-2 border-purple-500 pl-4">
                <p className="text-base font-medium italic leading-snug text-content-primary">“Neurons that fire together, wire together.”</p>
                <p className="mt-1 text-xs text-content-muted">Hebb’s rule: what you repeat gets easier, until it’s automatic.</p>
              </blockquote>
            </Reveal>

            <Reveal index={1}>
              <h2 className="section-title mb-3">How it works</h2>
              <div className="card divide-y divide-overlay-subtle">
                {MECHANISMS.map((m) => (
                  <div key={m.title} className="flex items-start gap-3 p-4">
                    <Tile icon={m.icon} tone={m.tone} size="sm" />
                    <div className="min-w-0">
                      <h3 className="item-name text-sm">{m.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{m.text}</p>
                    </div>
                  </div>
                ))}
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <div>
                    <h3 className="item-name text-sm">Structural change</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-content-muted">
                      The brain’s shape changes with use. London taxi drivers, who memorise thousands of streets, have a larger
                      back part of the hippocampus, a memory area used for finding your way.
                    </p>
                  </div>
                  <div>
                    <h3 className="item-name text-sm">Functional change</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-content-muted">
                      Jobs can move to new areas. After a stroke, training can teach healthy parts of the brain to take over speech
                      or movement.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal index={2}>
              <h2 className="section-title mb-3">What you can use it for</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {USES.map((u) => (
                  <div key={u.title} className="card flex items-start gap-3 p-4">
                    <Tile icon={u.icon} tone={u.tone} size="sm" />
                    <div className="min-w-0">
                      <h3 className="item-name text-sm">{u.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{u.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal index={3}>
              <h2 className="section-title mb-3">How to rewire, step by step</h2>
              <ol className="card divide-y divide-overlay-subtle">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex items-start gap-3 p-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-medium text-purple-hierarchy tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="item-name text-sm">{s.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal index={4}>
              <h2 className="section-title mb-3">How long it takes</h2>
              <ol className="card relative space-y-5 p-5">
                {TIMELINE.map((t, i) => (
                  <li key={t.when} className="relative flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={cx(
                          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                          i === TIMELINE.length - 1 ? 'bg-emerald-400' : 'bg-purple-400'
                        )}
                      />
                      {i < TIMELINE.length - 1 && <span className="mt-1 w-px flex-1 bg-overlay-default" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-xs font-medium text-purple-hierarchy">{t.when}</p>
                      <h3 className="item-name mt-0.5 text-sm">{t.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{t.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </>
        }
        aside={
          <>
            <Reveal index={1}>
              <h2 className="section-title mb-3">Why it’s good news</h2>
              <ul className="card space-y-2.5 p-5 text-sm text-content-tertiary">
                {[
                  'You are not stuck with your current habits, moods or skills.',
                  'Small daily effort adds up to real, physical change.',
                  'Bad habits weaken when you stop repeating them.',
                  'It works at any age.',
                  'Every repeat counts, even on a bad day.',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check size={15} className="mt-0.5 shrink-0 text-success-text" aria-hidden="true" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal index={2}>
              <h2 className="section-title mb-3">Myths and facts</h2>
              <div className="card divide-y divide-overlay-subtle">
                {MYTHS.map((m) => (
                  <div key={m.myth} className="space-y-1 p-4">
                    <p className="text-xs text-content-muted line-through decoration-rose-400/70">{m.myth}</p>
                    <p className="text-sm leading-relaxed text-content-secondary">{m.fact}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal index={3}>
              <h2 className="section-title mb-3">Put it to work in AscendDay</h2>
              <div className="card divide-y divide-overlay-subtle">
                {ASCEND_LINKS.map((a) => {
                  const content = (
                    <>
                      <Tile icon={a.icon} tone={a.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="item-name block text-sm">{a.title}</span>
                        <span className="block text-xs text-content-muted">{a.text}</span>
                      </span>
                      {onViewChange && <ArrowRight size={14} className="shrink-0 text-content-muted" aria-hidden="true" />}
                    </>
                  );
                  return onViewChange ? (
                    <button
                      key={a.title}
                      type="button"
                      onClick={() => onViewChange(a.view)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-overlay-subtle"
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={a.title} className="flex items-center gap-3 p-4">
                      {content}
                    </div>
                  );
                })}
              </div>
            </Reveal>

            <Reveal index={4}>
              <h2 className="section-title mb-3">Go deeper</h2>
              <div className="card divide-y divide-overlay-subtle">
                {neuroLessons.map((lesson) => {
                  const read = isRead(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setOpenLesson(lesson)}
                      className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-overlay-subtle"
                    >
                      <span
                        className={cx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                          read ? 'bg-primary-500/15 text-brand-text' : 'bg-overlay-subtle text-content-muted'
                        )}
                      >
                        {read ? <Check size={15} aria-hidden="true" /> : <BookOpen size={15} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="item-name block text-sm leading-snug">{lesson.title}</span>
                        <span className="mt-0.5 block text-xs text-content-muted">
                          {lesson.readTime} min ·{' '}
                          {read ? <span className="text-success-text">Read</span> : <span className="text-brand-text">{pointsLabel(lesson.points)}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {onViewChange && (
                <button type="button" onClick={() => onViewChange('lessons')} className="btn-ghost mt-3 text-xs">
                  All lessons <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </Reveal>

            <p className="flex items-start gap-2 px-1 text-micro leading-relaxed text-content-muted">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              General education, not medical advice. For brain injury or mental health concerns, talk to a doctor.
            </p>
          </>
        }
      />

      <LessonReader
        lesson={openLesson}
        isRead={openLesson ? isRead(openLesson.id) : false}
        next={openLesson ? nextLesson(openLesson) : undefined}
        onMarkRead={(id) => store.markLessonRead(id)}
        onOpenLesson={setOpenLesson}
        onClose={() => setOpenLesson(null)}
      />
    </div>
  );
}
