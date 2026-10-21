import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  BookOpen,
  BrainCircuit,
  CheckSquare,
  Clock,
  Compass,
  FolderKanban,
  HeartPulse,
  NotebookPen,
  ShieldAlert,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { View } from '@/lib/views';

/** The public feature pages, `/features/<slug>`. Slugs never change once published (redirect if one must). */
export const FEATURE_SLUGS = [
  'habits',
  'bad-habits',
  'exercise',
  'reading',
  'skills',
  'time-blocking',
  'recovery',
  'brain-lessons',
  'journal',
  'weekly-goals',
  'projects-goals',
  'plans',
  'leagues',
  'ranks',
  'accountability-partners',
] as const;

export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

/** The app's own groups (nav/navConfig.ts NAV_GROUPS), so the site reads like the app. */
export type FeatureGroup = 'Track' | 'Mind' | 'Plan' | 'Play';

export const FEATURE_GROUPS: { id: FeatureGroup; line: string }[] = [
  { id: 'Track', line: 'Log what you do every day.' },
  { id: 'Mind', line: 'Train focus, recover, and reflect.' },
  { id: 'Plan', line: 'Turn what you want into steps.' },
  { id: 'Play', line: 'Compete, rank up, and do it together.' },
];

export interface FeatureMeta {
  slug: FeatureSlug;
  /** The feature's name as the app's navigation shows it. */
  name: string;
  group: FeatureGroup;
  /** The app pages this feature lives on (the first one is where "Open" goes). */
  appViews: View[];
  icon: LucideIcon;
  /** `<title>`: keyword first, brand last, about 60 characters at most. */
  title: string;
  /** Meta description: 120–155 characters. */
  description: string;
  /** The page's one heading. */
  h1: string;
  /** One line for the cards on the landing page and /features. */
  summary: string;
  /** Alt text of the page's link-preview image. */
  ogAlt: string;
}

export const FEATURES: Record<FeatureSlug, FeatureMeta> = {
  habits: {
    slug: 'habits',
    name: 'Habits',
    group: 'Track',
    appViews: ['habits'],
    icon: CheckSquare,
    title: 'Gamified Habit Tracker with Points & Streaks – Ascend',
    description:
      'Track daily and weekly habits in Ascend, a free gamified habit tracker: tick a habit, keep the streak and earn points that count toward your rank.',
    h1: 'A habit tracker that turns every tick into progress',
    summary: 'Daily and weekly habits with streaks. Library habits earn points; missing them costs points.',
    ogAlt: 'Ascend habit tracker: daily habits with streaks and points',
  },
  'bad-habits': {
    slug: 'bad-habits',
    name: 'Bad habits',
    group: 'Track',
    appViews: ['bad-habits'],
    icon: ShieldAlert,
    title: 'Bad Habit Tracker with Points & Penalties – Ascend',
    description:
      'Break bad habits with Ascend: log every day you resist to earn points, and lose points when you slip or skip logging. Free bad habit tracker on the web.',
    h1: 'A bad habit tracker where resisting pays and slipping costs',
    summary: 'Log each day you resisted or slipped. Resisting earns points; slips and silence cost them.',
    ogAlt: 'Ascend bad habit tracker: resist days earn points, slips cost points',
  },
  exercise: {
    slug: 'exercise',
    name: 'Exercise',
    group: 'Track',
    appViews: ['exercise'],
    icon: Activity,
    title: 'Workout Tracker That Earns Points – Ascend',
    description:
      'Log runs, push-ups, gym sets or rides in Ascend. Minutes, reps, sets and kilometres all earn points, so every workout moves your rank. Free on the web.',
    h1: 'A workout tracker where every rep counts toward your rank',
    summary: 'Log minutes, reps, sets or kilometres. Every workout earns points up to a daily cap.',
    ogAlt: 'Ascend workout tracker: logged workouts earn points',
  },
  reading: {
    slug: 'reading',
    name: 'Reading Hub',
    group: 'Track',
    appViews: ['reading'],
    icon: BookOpen,
    title: 'Gamified Reading Tracker – Pages, Streaks & Points – Ascend',
    description:
      'Track books, pages and chapters in Ascend. Pages earn points, finished books earn a bonus, and a reading streak keeps you coming back. Free reading tracker.',
    h1: 'A reading tracker that rewards pages, not just finished books',
    summary: 'A library of books with pages or chapters, a reading streak and a finish bonus.',
    ogAlt: 'Ascend reading tracker: books in progress with pages read and points',
  },
  skills: {
    slug: 'skills',
    name: 'Skills',
    group: 'Track',
    appViews: ['skills'],
    icon: Zap,
    title: 'Skill Tracker – Log Practice Hours & Level Up – Ascend',
    description:
      'Track practice time for any skill in Ascend. Minutes earn points, hours build levels from Beginner to Expert, and a streak shows your consistency.',
    h1: 'A skill tracker that turns practice hours into levels',
    summary: 'Log practice minutes for each skill. Minutes earn points; hours build each skill’s level.',
    ogAlt: 'Ascend skill tracker: practice hours and skill levels',
  },
  'time-blocking': {
    slug: 'time-blocking',
    name: 'Time Tracker',
    group: 'Track',
    appViews: ['time-tracker'],
    icon: Clock,
    title: 'Time Blocking App – Plan Your Day in Blocks – Ascend',
    description:
      'Plan your day in time blocks with Ascend, tick them off as you go and earn points for following your plan. Reusable day templates included. Free.',
    h1: 'Time blocking that rewards you for following your plan',
    summary: 'Split the day into blocks, reuse templates, and earn points for the blocks you finish.',
    ogAlt: 'Ascend time tracker: a day planned in time blocks',
  },
  recovery: {
    slug: 'recovery',
    name: 'Recovery',
    group: 'Mind',
    appViews: ['recovery'],
    icon: HeartPulse,
    title: 'Sobriety Tracker & Clean Streak Counter – Ascend',
    description:
      'Count your clean days, log cravings and open quick support when an urge hits. Ascend’s recovery tracker is a free self-help tool, not medical treatment.',
    h1: 'A sobriety tracker that counts every clean day',
    summary: 'A clean-streak clock, a craving log and quick support. Milestones earn points.',
    ogAlt: 'Ascend recovery tracker: clean streak clock and craving log',
  },
  'brain-lessons': {
    slug: 'brain-lessons',
    name: 'Focus, Neuro & Lessons',
    group: 'Mind',
    appViews: ['prefrontal', 'neuroplasticity', 'lessons'],
    icon: BrainCircuit,
    title: 'Focus Timer, Neuroplasticity & Brain Lessons – Ascend',
    description:
      'Deep-focus sessions that earn points, a decision journal, emotion labeling, a plain guide to neuroplasticity and short lessons on habits and the brain.',
    h1: 'Train focus and learn how your brain changes',
    summary: 'A focus timer, decision journal and emotion labeling, plus a neuroplasticity guide and lessons.',
    ogAlt: 'Ascend focus timer and brain lessons',
  },
  journal: {
    slug: 'journal',
    name: 'Journal',
    group: 'Mind',
    appViews: ['journal'],
    icon: NotebookPen,
    title: 'Gamified Journal App – Daily Entries Earn Points – Ascend',
    description:
      'Write one journal entry a day in Ascend, pick your mood, follow a guided prompt and earn points for showing up. A free gamified journal app on the web.',
    h1: 'A gamified journal that rewards showing up every day',
    summary: 'One entry a day with your mood and an optional guided prompt. Each day’s entry earns points.',
    ogAlt: 'Ascend gamified journal: today’s entry, mood and journal streak',
  },
  'weekly-goals': {
    slug: 'weekly-goals',
    name: 'Weekly Goals',
    group: 'Plan',
    appViews: ['weekly-goals'],
    icon: Target,
    title: 'Weekly Goals App with Points & Reflection – Ascend',
    description:
      'Set a few goals each week in Ascend, link them to habits, workouts, reading or skills so they fill in on their own, and reflect at the weekend for points.',
    h1: 'Weekly goals that fill in from what you actually do',
    summary: 'A few goals a week that track themselves from your logs, plus a weekend reflection.',
    ogAlt: 'Ascend weekly goals: this week’s goals with progress bars',
  },
  'projects-goals': {
    slug: 'projects-goals',
    name: 'Projects & Goals',
    group: 'Plan',
    appViews: ['projects-goals'],
    icon: FolderKanban,
    title: 'Goal Planner – Goals, Projects & Tasks in One Place – Ascend',
    description:
      'Break a big goal into projects and small daily tasks in Ascend. Done tasks fill their project, done projects fill their goal. A free goal planner.',
    h1: 'A goal planner that links today’s tasks to your biggest goals',
    summary: 'Goals split into projects and tasks. Finished tasks fill projects; finished projects fill goals.',
    ogAlt: 'Ascend projects and goals: a goal broken into projects and tasks',
  },
  plans: {
    slug: 'plans',
    name: 'Plans',
    group: 'Plan',
    appViews: ['plans'],
    icon: Compass,
    title: 'Self-Improvement Plans – Make, Copy & Track – Ascend',
    description:
      'Build a self-improvement plan in Ascend: milestones, a number to reach, a habit journey or a long-term vision. Share it or copy one from Discover.',
    h1: 'Self-improvement plans you can build, share and copy',
    summary: 'Milestones, targets, habit journeys and visions. Make your own or copy one from Discover.',
    ogAlt: 'Ascend plans: milestone, target, journey and vision plans',
  },
  leagues: {
    slug: 'leagues',
    name: 'Leagues',
    group: 'Play',
    appViews: ['leagues'],
    icon: Trophy,
    title: 'Self-Improvement Leagues – Weekly, Monthly & 90-Day – Ascend',
    description:
      'Compete with real people on habits, reading, workouts and more. Ascend ranks everyone in a weekly, a monthly and a 90-day league. Free to join.',
    h1: 'Leagues that turn self-improvement into a competition',
    summary: 'Weekly, monthly and 90-day tables of real people, ranked by the points they earn.',
    ogAlt: 'Ascend leagues: weekly league table',
  },
  ranks: {
    slug: 'ranks',
    name: 'Ranks',
    group: 'Play',
    appViews: ['tiers'],
    icon: Award,
    title: 'Ranks & Seasons – Level Up Your Real Life – Ascend',
    description:
      'Climb nine ranks from Beginner to Master with the points you earn in Ascend. Every 90-day season starts again, so the ladder is always open.',
    h1: 'Nine ranks from Beginner to Master, a fresh climb every season',
    summary: 'Season points move you up nine ranks. Every 90-day season starts the climb again.',
    ogAlt: 'Ascend ranks: the ladder from Beginner to Master',
  },
  'accountability-partners': {
    slug: 'accountability-partners',
    name: 'Partners',
    group: 'Play',
    appViews: ['partner'],
    icon: Users,
    title: 'Accountability Partner App – Daily Challenges – Ascend',
    description:
      'Pair up with a friend in Ascend, run a daily challenge together, nudge each other and see when a habit slips. A free accountability partner app.',
    h1: 'An accountability partner app for doing it together',
    summary: 'Add a friend, run a daily challenge together and nudge each other to keep going.',
    ogAlt: 'Ascend partners: a daily challenge shared by two friends',
  },
};

export const featurePath = (slug: FeatureSlug): string => `/features/${slug}`;

export const featuresInGroup = (group: FeatureGroup): FeatureMeta[] =>
  FEATURE_SLUGS.map((slug) => FEATURES[slug]).filter((feature) => feature.group === group);
