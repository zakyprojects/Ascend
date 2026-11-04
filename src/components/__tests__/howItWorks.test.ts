import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { HowItWorksBody, type HowItWorksGuide } from '../ui/HowItWorks';
import { projectsGoalsGuide } from '../howItWorks/projectsGoals';
import { skillsGuide } from '../howItWorks/skills';
import { readingGuide } from '../howItWorks/reading';
import { timeTrackerGuide } from '../howItWorks/timeTracker';
import { weeklyGoalsGuide } from '../howItWorks/weeklyGoals';
import { habitsGuide } from '../howItWorks/habits';
import { badHabitsGuide } from '../howItWorks/badHabits';
import { partnersGuide } from '../howItWorks/partners';
import { prefrontalCortexGuide } from '../howItWorks/prefrontalCortex';
import { leaguesGuide } from '../howItWorks/leagues';
import { plansGuide } from '../howItWorks/plans';
import { recoveryGuide } from '../howItWorks/recovery';
import { exerciseGuide } from '../howItWorks/exercise';
import { journalGuide } from '../howItWorks/journal';
import {
  BAD_HABIT_POINTS,
  JOURNAL_POINTS,
  PFC_POINTS,
  PRESET_HABIT_POINTS,
  READING_POINTS,
  RECOVERY_POINTS,
  SKILLS_POINTS,
  SOBRIETY_MILESTONE_POINTS,
  TIME_TRACKER_POINTS,
  WEEKLY_GOALS_POINTS,
  WEEKLY_REFLECTION_POINTS,
  WORKOUT_POINTS,
} from '@/lib/pointsConfig';
import { CUSTOM_HABIT_POINTS } from '@/lib/habitAwards';
import { READING_BONUS_COOLDOWN_DAYS, READING_BONUS_MIN_LOG_DAYS, READING_BONUS_MIN_SPAN_DAYS } from '@/lib/readingAwards';
import { FOCUS_FIRST_MILESTONE_POINTS, FOCUS_MIN_MINUTES, FOCUS_STEP_MINUTES } from '@/lib/focusPoints';
import { FOCUS_RESUME_WINDOW_MINUTES } from '@/lib/focusSession';
import { MAX_PARTNERS, CHALLENGE_LENGTH_OPTIONS } from '@/lib/partnerRules';
import { SKILL_LEVELS } from '@/lib/skillLevels';
import { MIN_JOURNAL_CONTENT_LENGTH } from '@/lib/journalRules';
import { getMissPenaltyMultiplier } from '@/lib/missPenalty';

/**
 * Every page's How it works renders in plain Node, carries its rules' numbers from the constants,
 * ends with a Points section, and has none of the old guide's filler (slogans, brand name,
 * "For example:" lines). The pages it replaced keep no second copy of the rules.
 */
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const textOf = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const BANNED = ['dream stays', 'just a wish', 'A dream becomes', 'AscendDay', 'For example', 'locked ·', '· open', 'Without a', 'guitar', 'Guitar', 'scales', 'Scales'];

const guides: [string, HowItWorksGuide, (string | number)[]][] = [
  ['projectsGoals', projectsGoalsGuide, ['earns no points']],
  [
    'skills',
    skillsGuide,
    [
      `Every ${SKILLS_POINTS.minutesPerPoint} min`,
      `${SKILLS_POINTS.dailyCap} pts`,
      ...SKILL_LEVELS.filter((l) => l.next).map((l) => `${l.below} hrs ${l.next}`),
      `+${WEEKLY_GOALS_POINTS.pointsPerGoal} pts`,
      'Only minutes earn points',
      'LeetCode problems',
      'every log needs its minutes',
    ],
  ],
  [
    'reading',
    readingGuide,
    [
      `Every ${READING_POINTS.pagesPerPoint} pages`,
      `${READING_POINTS.pointsPerChapter} pts`,
      `${READING_POINTS.dailyCap} pts`,
      `+${READING_POINTS.completionBonus} pts`,
      `${READING_BONUS_MIN_LOG_DAYS} separate days`,
      `${READING_BONUS_MIN_SPAN_DAYS} +`,
      `every ${READING_BONUS_COOLDOWN_DAYS} days`,
    ],
  ],
  [
    'timeTracker',
    timeTrackerGuide,
    [
      `${TIME_TRACKER_POINTS.tiers.high.minPercent}%`,
      `+${TIME_TRACKER_POINTS.tiers.high.points} pts`,
      `+${TIME_TRACKER_POINTS.tiers.medium.points} pts`,
      `${Math.round(TIME_TRACKER_POINTS.skipExclusionRatio * 100)}%`,
      `at most ${TIME_TRACKER_POINTS.maxExcludedSkips}`,
      '02:00',
      "yesterday’s last block",
    ],
  ],
  [
    'weeklyGoals',
    weeklyGoalsGuide,
    [
      `+${WEEKLY_GOALS_POINTS.pointsPerGoal} pts`,
      `first ${WEEKLY_GOALS_POINTS.maxGoalsCounted}`,
      `${WEEKLY_GOALS_POINTS.maxWeeklyPoints} pts`,
      `+${WEEKLY_REFLECTION_POINTS.awarded} pts`,
      'Friday 6:00 AM',
      'I update it myself',
      'workouts, minutes, reps, sets or km',
      'pages or chapters',
      'one of its counts',
      'Linked and manual goals earn the same',
    ],
  ],
  [
    'habits',
    habitsGuide,
    [
      `+${CUSTOM_HABIT_POINTS} pt`,
      `${PRESET_HABIT_POINTS.dailyCap} pts`,
      `×${getMissPenaltyMultiplier(2, 0)}`,
      `×${getMissPenaltyMultiplier(3, 2000)}`,
      'Weekly custom habits earn no points',
    ],
  ],
  [
    'badHabits',
    badHabitsGuide,
    [
      `+${BAD_HABIT_POINTS.customResist} pt`,
      `${BAD_HABIT_POINTS.dailyCap} pts`,
      `At most ${BAD_HABIT_POINTS.dailyPenaltyLimit} bad habits`,
      `−${BAD_HABIT_POINTS.customResist + BAD_HABIT_POINTS.penaltyExtra} pts`,
    ],
  ],
  ['partners', partnersGuide, [`Up to ${MAX_PARTNERS} partners`, ...CHALLENGE_LENGTH_OPTIONS.map(String), 'Challenges don’t give points', 'Slipped']],
  [
    'prefrontalCortex',
    prefrontalCortexGuide,
    [
      `${FOCUS_FIRST_MILESTONE_POINTS} pts at ${FOCUS_MIN_MINUTES} min`,
      `every ${FOCUS_STEP_MINUTES} min`,
      `${PFC_POINTS.focus.dailyCap} pts`,
      `within ${FOCUS_RESUME_WINDOW_MINUTES} min`,
      'Breaks, decisions and emotions earn no points',
    ],
  ],
  ['leagues', leaguesGuide, ['no points of their own', '00:00 UTC', 'sets your rank']],
  ['plans', plansGuide, ['Milestones', 'Target', 'Habit journey', 'Vision', 'earn no points']],
  [
    'recovery',
    recoveryGuide,
    [
      `+${SOBRIETY_MILESTONE_POINTS['1w']} pts`,
      `+${SOBRIETY_MILESTONE_POINTS['1m']} pts`,
      `+${SOBRIETY_MILESTONE_POINTS['90d']} pts`,
      `${RECOVERY_POINTS.seasonCap} pts`,
    ],
  ],
  [
    'exercise',
    exerciseGuide,
    [`${WORKOUT_POINTS.units.minsPerPoint} minutes`, `${WORKOUT_POINTS.units.repsPerPoint} reps`, `${WORKOUT_POINTS.dailyCap} pts`],
  ],
  ['journal', journalGuide, [`${MIN_JOURNAL_CONTENT_LENGTH} characters`, `+${JOURNAL_POINTS.entryCompleted} pts`]],
];

for (const [name, guide, expected] of guides) {
  const html = renderToString(createElement(HowItWorksBody, { guide }));
  const text = textOf(html) + ' ' + guide.title + ' ' + (guide.intro ?? '');
  assert(guide.title.startsWith('How '), `${name}: title starts with "How"`);
  assert(guide.steps.length >= 2 && guide.steps.length <= 5, `${name}: 2–5 steps (${guide.steps.length})`);
  assert(guide.points.length >= 1, `${name}: has Points lines`);
  assert(/<h3[^>]*>Points<\/h3>/.test(html), `${name}: Points section rendered`);
  assert(html.lastIndexOf('>Points<') > html.lastIndexOf('>Good to know<'), `${name}: Points is the last section`);
  assert(!html.includes('data-autofocus'), `${name}: nothing autofocuses when opened from the header`);
  for (const value of expected) assert(text.includes(String(value)), `${name}: shows "${value}"`);
  for (const phrase of BANNED) assert(!text.includes(phrase), `${name}: no "${phrase}"`);
  assert(!/\bdrills?\b/i.test(text), `${name}: user-facing word is "count", not "drill"`);

  const atPoints = renderToString(createElement(HowItWorksBody, { guide, focus: 'points' }));
  assert(/<h3[^>]*data-autofocus[^>]*>Points<\/h3>|<h3[^>]*>Points<\/h3>/.test(atPoints) && atPoints.includes('data-autofocus'), `${name}: focus=points marks the Points heading`);
}

// One explanation per page: the old side boxes and the CapMeter note are gone from the app.
const appSources = import.meta.glob<string>(['../**/*.tsx', '!../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });
assert(Object.keys(appSources).length > 50, 'app sources found');
for (const [file, code] of Object.entries(appSources)) {
  assert(!/<Disclosure title="How (points|challenges) work"/.test(code), `${file}: no "How points work" / "How challenges work" Disclosure`);
  assert(!/note=\{(capNote|timeTrackerCapNote|weeklyGoalsCapNote)/.test(code), `${file}: no CapMeter rule note`);
  if (/<CapMeterConnected /.test(code)) assert(/<CapMeterConnected [^>]*onExplain=/.test(code), `${file}: CapMeterConnected opens How it works`);
}

console.log(`howItWorks: ${guides.length} guides OK`);
