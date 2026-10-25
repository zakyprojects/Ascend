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
    title: 'Gamified Habit Tracker with Points & Streaks – AscendDay',
    description:
      'Track daily and weekly habits in AscendDay, a free gamified habit tracker: tick a habit, keep your habit streak and earn points that count toward your rank.',
    h1: 'A habit tracker that turns every tick into progress',
    summary: 'Daily and weekly habits with streaks. Library habits earn points; missing them costs points.',
    ogAlt: 'AscendDay habit tracker: daily habits with streaks and points',
  },
  'bad-habits': {
    slug: 'bad-habits',
    name: 'Bad habits',
    group: 'Track',
    appViews: ['bad-habits'],
    icon: ShieldAlert,
    title: 'Bad Habit Tracker – Quit Bad Habits with Points – AscendDay',
    description:
      'Quit bad habits with AscendDay: log every day you resist to earn points, and lose points when you slip or skip logging. A free bad habit tracker on the web.',
    h1: 'A bad habit tracker where resisting pays and slipping costs',
    summary: 'Log each day you resisted or slipped. Resisting earns points; slips and silence cost them.',
    ogAlt: 'AscendDay bad habit tracker: resist days earn points, slips cost points',
  },
  exercise: {
    slug: 'exercise',
    name: 'Exercise',
    group: 'Track',
    appViews: ['exercise'],
    icon: Activity,
    title: 'Workout Tracker That Earns Points – Reps & Sets – AscendDay',
    description:
      'Log runs, push-ups, gym sets or rides in AscendDay’s workout log. Minutes, reps, sets and kilometres all earn points, so every workout moves your rank.',
    h1: 'A workout tracker where every rep counts toward your rank',
    summary: 'Log minutes, reps, sets or kilometres. Every workout earns points up to a daily cap.',
    ogAlt: 'AscendDay workout tracker: logged workouts earn points',
  },
  reading: {
    slug: 'reading',
    name: 'Reading Hub',
    group: 'Track',
    appViews: ['reading'],
    icon: BookOpen,
    title: 'Gamified Reading Tracker – Streaks & Points – AscendDay',
    description:
      'A free gamified reading tracker: log pages read or chapters in AscendDay. Pages earn points, finished books earn a bonus, and a reading streak keeps you going.',
    h1: 'A reading tracker that rewards pages, not just finished books',
    summary: 'A library of books with pages or chapters, a reading streak and a finish bonus.',
    ogAlt: 'AscendDay reading tracker: books in progress with pages read and points',
  },
  skills: {
    slug: 'skills',
    name: 'Skills',
    group: 'Track',
    appViews: ['skills'],
    icon: Zap,
    title: 'Skill Practice Tracker – Log Hours & Level Up – AscendDay',
    description:
      'A free skill practice tracker: track practice time for any skill in AscendDay. Minutes earn points, and hours build each skill’s level from Beginner to Expert.',
    h1: 'A skill tracker that turns practice hours into levels',
    summary: 'Log practice minutes for each skill. Minutes earn points; hours build each skill’s level.',
    ogAlt: 'AscendDay skill tracker: practice hours and skill levels',
  },
  'time-blocking': {
    slug: 'time-blocking',
    name: 'Time Tracker',
    group: 'Track',
    appViews: ['time-tracker'],
    icon: Clock,
    title: 'Time Blocking App – Daily Time Block Planner – AscendDay',
    description:
      'A free time blocking app: plan your day in time blocks with AscendDay, tick them off as you go and earn points for following your plan. Day templates included.',
    h1: 'Time blocking that rewards you for following your plan',
    summary: 'Split the day into blocks, reuse templates, and earn points for the blocks you finish.',
    ogAlt: 'AscendDay time tracker: a day planned in time blocks',
  },
  recovery: {
    slug: 'recovery',
    name: 'Recovery',
    group: 'Mind',
    appViews: ['recovery'],
    icon: HeartPulse,
    title: 'Sobriety Tracker & Clean Streak Counter – AscendDay',
    description:
      'A sobriety tracker that counts your days clean, with a craving log and quick support when an urge hits. Free self-help in AscendDay, not medical treatment.',
    h1: 'A sobriety tracker that counts every clean day',
    summary: 'A clean-streak clock, a craving log and quick support. Milestones earn points.',
    ogAlt: 'AscendDay recovery tracker: clean streak clock and craving log',
  },
  'brain-lessons': {
    slug: 'brain-lessons',
    name: 'Focus, Neuro & Lessons',
    group: 'Mind',
    appViews: ['prefrontal', 'neuroplasticity', 'lessons'],
    icon: BrainCircuit,
    title: 'Focus Timer with Points, Neuroplasticity Lessons – AscendDay',
    description:
      'A focus timer that earns points, plus a decision journal, emotion labeling, a plain guide to neuroplasticity and short lessons on habits and the brain.',
    h1: 'Train focus and learn how your brain changes',
    summary: 'A focus timer, decision journal and emotion labeling, plus a neuroplasticity guide and lessons.',
    ogAlt: 'AscendDay focus timer and brain lessons',
  },
  journal: {
    slug: 'journal',
    name: 'Journal',
    group: 'Mind',
    appViews: ['journal'],
    icon: NotebookPen,
    title: 'Gamified Journal App – Prompts, Mood & Streaks – AscendDay',
    description:
      'A free gamified journal app: write one entry a day in AscendDay, log your mood, answer a guided prompt and earn points as your journaling streak grows.',
    h1: 'A gamified journal that rewards showing up every day',
    summary: 'One entry a day with your mood and an optional guided prompt. Each day’s entry earns points.',
    ogAlt: 'AscendDay gamified journal: today’s entry, mood and journal streak',
  },
  'weekly-goals': {
    slug: 'weekly-goals',
    name: 'Weekly Goals',
    group: 'Plan',
    appViews: ['weekly-goals'],
    icon: Target,
    title: 'Weekly Goals App with Points & Reflection – AscendDay',
    description:
      'A free weekly goals app: set a few goals, link them to habits, workouts, reading or skills so they fill in on their own, and add a weekly reflection.',
    h1: 'Weekly goals that fill in from what you actually do',
    summary: 'A few goals a week that track themselves from your logs, plus a weekend reflection.',
    ogAlt: 'AscendDay weekly goals: this week’s goals with progress bars',
  },
  'projects-goals': {
    slug: 'projects-goals',
    name: 'Projects & Goals',
    group: 'Plan',
    appViews: ['projects-goals'],
    icon: FolderKanban,
    title: 'Goal Planner – Goals, Projects & Daily Tasks – AscendDay',
    description:
      'A free goal planner: break a big goal into projects and small daily tasks in AscendDay. Done tasks fill their project, and done projects fill their goal.',
    h1: 'A goal planner that links today’s tasks to your biggest goals',
    summary: 'Goals split into projects and tasks. Finished tasks fill projects; finished projects fill goals.',
    ogAlt: 'AscendDay projects and goals: a goal broken into projects and tasks',
  },
  plans: {
    slug: 'plans',
    name: 'Plans',
    group: 'Plan',
    appViews: ['plans'],
    icon: Compass,
    title: 'Self-Improvement Plans – Make, Copy & Track – AscendDay',
    description:
      'Build a self-improvement plan in AscendDay: milestones, a number to reach, a habit journey or a long-term vision. Share it, or copy a plan from Discover.',
    h1: 'Self-improvement plans you can build, share and copy',
    summary: 'Milestones, targets, habit journeys and visions. Make your own or copy one from Discover.',
    ogAlt: 'AscendDay plans: milestone, target, journey and vision plans',
  },
  leagues: {
    slug: 'leagues',
    name: 'Leagues',
    group: 'Play',
    appViews: ['leagues'],
    icon: Trophy,
    title: 'Self-Improvement Leagues & Habit Leaderboard – AscendDay',
    description:
      'Free self-improvement leagues: compete with real people on habits, reading, workouts and more on weekly, monthly and 90-day leaderboards in AscendDay.',
    h1: 'Leagues that turn self-improvement into a competition',
    summary: 'Weekly, monthly and 90-day tables of real people, ranked by the points they earn.',
    ogAlt: 'AscendDay leagues: weekly league table',
  },
  ranks: {
    slug: 'ranks',
    name: 'Ranks',
    group: 'Play',
    appViews: ['tiers'],
    icon: Award,
    title: 'Self-Improvement Ranks – Level Up Your Real Life – AscendDay',
    description:
      'Level up your real life: climb nine self-improvement ranks from Beginner to Master with the points you earn in AscendDay. Every 90-day season starts again.',
    h1: 'Nine ranks from Beginner to Master, a fresh climb every season',
    summary: 'Season points move you up nine ranks. Every 90-day season starts the climb again.',
    ogAlt: 'AscendDay ranks: the ladder from Beginner to Master',
  },
  'accountability-partners': {
    slug: 'accountability-partners',
    name: 'Partners',
    group: 'Play',
    appViews: ['partner'],
    icon: Users,
    title: 'Accountability Partner App – Habit Challenges – AscendDay',
    description:
      'A free accountability partner app: pair up in AscendDay, run a daily habit challenge with a friend, nudge a friend who hasn’t ticked yet and keep going.',
    h1: 'An accountability partner app for doing it together',
    summary: 'Add a friend, run a daily challenge together and nudge each other to keep going.',
    ogAlt: 'AscendDay partners: a daily challenge shared by two friends',
  },
};

export const featurePath = (slug: FeatureSlug): string => `/features/${slug}`;

export const featuresInGroup = (group: FeatureGroup): FeatureMeta[] =>
  FEATURE_SLUGS.map((slug) => FEATURES[slug]).filter((feature) => feature.group === group);
