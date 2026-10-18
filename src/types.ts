export type HabitFrequency = 'daily' | 'weekly';

export type Mood = 'happy' | 'neutral' | 'sad' | 'motivated';

export const EMOJI_AVATARS = [
  // Row 1: Animals & Energy
  '🦁', '🦊', '🐺', '🦅', '🐯', '🐻', '🥦', '⚡',
  // Row 2: Achievements & Mindset
  '🔥', '💎', '⭐', '🎯', '🚀', '🧠', '🏆', '💪',
  // Row 3: Humans, Mindfulness & Focus
  '👩', '👨', '🧘‍♀️', '🧘‍♂️', '🦉', '🦄', '👑', '📚',
  // Row 4: Growth, Discipline & Activity
  '🌱', '🐢', '🥋', '🏃‍♂️', '🐉', '🌙', '🐬', '🎮'
];

/** The UserProfile fields that switch a server-sent notification type on or off. */
export type NotificationPreferenceKey = 'notifDailyReminder' | 'notifPartnerActivity' | 'notifSundayPlanning';

export interface UserProfile {
  id: string;
  uid: string; // Permanent 6-digit numeric User ID (e.g. "849201")
  email: string;
  username: string;
  avatar: string; // emoji
  createdAt: string;
  /** Whether detailed statistics and habits list are visible to other users on leaderboards (default true) */
  isProfilePublic?: boolean;
  /** Whether the user accepts new incoming accountability partner invites (default true) */
  acceptPartnerInvites?: boolean;
  /** Notification preferences (default true) */
  notifDailyReminder?: boolean;
  notifPartnerActivity?: boolean;
  notifSundayPlanning?: boolean;
  /** Whether the user is currently an anonymous guest account */
  isAnonymous?: boolean;
  /** ISO timestamp string of the last username change */
  lastUsernameChangeAt?: string;
  /** Past season history and trophy badges */
  season_history?: SeasonHistoryEntry[];
}

export interface UserStats {
  streakDays: number;
  streakSource?: string;
  currentStreakDays: number;
  currentStreakCategory: string;
  currentStreakIsActive: boolean;
  bestStreakDays?: number;
  bestStreakCategory?: string;
  habitsCompletedCount: number;
  journalEntriesCount: number;
  exerciseMinutes: number;
  booksRead: number;
  skillsPracticedCount: number;
  season_history?: SeasonHistoryEntry[];
}

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  points: number;
  /** Whether this habit came from the preset library (earns points) or is custom (no points) */
  isPreset: boolean;
  /** Preset category, if from library */
  category?: string;
  createdAt: string;
  updatedAt?: string;
  /** Map of period/date keys to completion status with ISO timestamp and actual awarded points */
  completions: Record<string, { done: boolean; updatedAt: string; pointsAwarded?: number }>;
  createdAtPeriod: string;
  /** Periods that were missed and penalized */
  missedPeriods?: string[];
  /** @deprecated Phase A: Replaced with dynamic derivation from habit.completions. Kept for schema compatibility. */
  consecutiveMisses?: number;
  /** Whether this habit is automatically linked to a system module */
  isSystemLinked?: boolean;
  /** System module linked to this habit */
  linkedModule?: 'reading';
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mood: Mood;
  content: string;
  createdAt: string;
  /** Whether points have been awarded for this entry */
  pointsAwarded: boolean;
}

export type LeagueType = 'weekly' | 'monthly' | 'ninetyDay';

export interface LeagueCompetitor {
  id?: string;
  uid?: string;
  name: string;
  avatar: string; // emoji
  points: number; // period points
  totalPoints: number; // overall lifetime points (tier is driven by season points)
  isUser?: boolean;
  isRealUser?: boolean;
  /** Retired seed (filler) accounts; only old saved archives still carry it, and load drops them. */
  isSeed?: boolean;
  isProfilePublic?: boolean;
  stats?: UserStats;
  activeHabits?: { name: string; category?: string; frequency: string; isPreset: boolean }[];
  season_history?: SeasonHistoryEntry[];
}

export interface LeagueArchive {
  id?: string;
  type: LeagueType;
  periodLabel: string;
  seasonNumber?: number;
  competitors: LeagueCompetitor[];
  userRank: number;
  userPoints: number;
  archivedAt: string;
  completedAt?: string;
  participantCount?: number;
  /** 'ledger': scored from the complete points ledger. Absent: scored from pointsHistory alone (old archives). */
  scoreSource?: 'ledger';
  /** 'server': written by ascend_run_league_archives. 'client': written by the app before that (kept as history). */
  source?: 'server' | 'client';
  /** Server archive past its 48-hour recompute window: its standings no longer change. */
  final?: boolean;
}

/** A closed season's final score, published on the member's profile (profiles.season_history). */
export interface SeasonHistoryEntry {
  /** Absent on entries written before seasons were numbered. */
  seasonNumber?: number;
  seasonName: string;
  points: number;
  date: string;
}

export interface Lesson {
  id: string;
  title: string;
  category: string;
  readTime: number; // minutes
  content: string;
  points: number;
}

export interface AppState {
  currentUser: UserProfile | null;
  habits: Habit[];
  journalEntries: JournalEntry[];
  seasonId: number;
  seasonPoints: number;
  /** DEPRECATED: Mirrored alias for seasonPoints to maintain backward compatibility */
  totalPoints?: number;
  /** Points ledger entries for history */
  pointsHistory: PointsEntry[];
  /** League archives — final standings from completed periods */
  leagueArchives: LeagueArchive[];
  /** IDs of lessons the user has read */
  readLessonIds: string[];
  /** Username for league display */
  username: string;
}

export interface PointsEntry {
  id: string;
  amount: number;
  reason: string;
  source: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Module 1: Exercise Tracker
export type ExerciseMetricUnit = 'reps' | 'sets' | 'km' | 'mins' | 'sessions';

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  type: string; // e.g., 'Running', 'Cycling', 'Weightlifting', etc.
  durationMinutes: number;
  pointsAwarded: number;
  amount?: number;
  unit?: ExerciseMetricUnit | string;
  createdAt: string;
}

export type ExerciseLog = WorkoutLog;

// Module 2: Reading Tracker
export interface Book {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  unit: 'pages' | 'chapters';
  currentPage: number;
  isFinished: boolean;
  reflection?: string;
  finishedAt?: string;
  createdAt: string;
  targetFinishDate?: string;
  /** @deprecated Book deadline penalties removed. Field retained for schema/backward compatibility. */
  consecutiveMisses?: number;
  /** @deprecated Book deadline penalties removed. Field retained for schema/backward compatibility. */
  lastPenalizedDate?: string;
}

/** @deprecated The weekly exercise goal was removed 2026-10-17 (weekly goals can link exercise). Kept so old saved state still loads. */
export interface ExerciseGoal {
  targetWeeklySessions: number;
  /** @deprecated Phase A: Replaced with dynamic derivation from AppState.workouts. Kept for schema compatibility. */
  consecutiveMisses?: number;
  lastEvaluatedWeek?: string;
  createdAt?: string;
}

export interface ReadingLog {
  id: string;
  bookId?: string;
  date: string; // YYYY-MM-DD
  pagesRead: number; // positive delta only
  createdAt: string; // ISO timestamp
  pointsAwarded?: number;
  finish?: boolean; // unread pages added by Finish: no page points, still a reading day
}

export type ReadingProgressLog = ReadingLog;

// Self Improvement Books - Curated Library & User Library
export type BookCategory =
  | 'Habits'
  | 'Mindset'
  | 'Productivity'
  | 'Discipline'
  | 'Finance'
  | 'Relationships'
  | 'Spirituality'
  | 'Business'
  | 'Influence';

export type UserBookStatus = 'to-read' | 'reading' | 'completed' | 'to_read';

export interface CuratedBook {
  id: string;
  title: string;
  author: string;
  description: string;
  category: BookCategory;
  coverImageUrl?: string;
  isCurated: true;
  pointsOnCompletion: number;
  pointsReward?: number;
  totalPages?: number;
  totalAmount?: number;
  trendingRank?: number;
  bestSellerRank?: number;
}

export interface UserBook {
  id: string;
  curatedBookId?: string;
  title: string;
  author: string;
  description?: string;
  category?: BookCategory | string;
  coverImageUrl?: string;
  isCurated?: boolean;
  isCustom?: boolean;
  pointsReward?: number;
  pointsAwarded: number;
  status: UserBookStatus;
  
  // Tracking fields
  totalAmount?: number;
  currentAmount?: number;
  unit?: 'pages' | 'chapters' | 'mins' | 'Pages' | 'Mins' | 'Chapters' | string;
  targetFinishDate?: string;
  dateStarted?: string;
  dateCompleted?: string;
  reflection?: string;

  // Backward compatibility fields
  totalPages?: number;
  currentPage?: number;
  addedAt: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  isFinished?: boolean;
  linkedBookId?: string;
  /** @deprecated Book deadline penalties removed. Field retained for schema/backward compatibility. */
  consecutiveMisses?: number;
  /** @deprecated Book deadline penalties removed. Field retained for schema/backward compatibility. */
  lastPenalizedDate?: string;
}

// Module 3: Skill Learning Tracker
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Skill {
  id: string;
  name: string;
  category?: string;
  manualLevel?: SkillLevel;
  /** Practice minutes of logs the user cleared; still count toward hours and level. */
  clearedMinutes?: number;
  createdAt: string;
}

export interface SkillSessionLog {
  id: string;
  skillId: string;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  note: string;
  pointsAwarded: number;
  createdAt: string;
}

// Module 4: Bad Habit Reduction Tracker
export interface BadHabit {
  id: string;
  name: string;
  /** Legacy (commitment goal, removed 2026-10-17); old rows may still carry it. */
  commitmentDays?: number;
  isCompleted?: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface BadHabitLog {
  id: string;
  badHabitId: string;
  date: string; // YYYY-MM-DD
  status: 'resisted' | 'occurred' | 'no_report';
  consecutiveOccurrences?: number;
  pointsAwardedOrDeducted: number;
  createdAt: string;
  updatedAt?: string;
}

// Module 5: Addiction Recovery Tracker
export interface AddictionMilestoneAward {
  id?: string;
  milestone: string; // '1w' | '1m' | '90d'
  seasonNumber: number;
  timestamp: string; // ISO timestamp
  streakStart?: string;
  points: number;
}

export function getAwardKey(a: AddictionMilestoneAward): string {
  return a.id ?? `${a.milestone}_${a.timestamp}`;
}

export interface AddictionTracker {
  id: string;
  title: string;
  startDate: string; // ISO timestamp
  milestonesUnlocked: string[]; // ['1w', '1m', '90d'] - active streak milestones
  awardedMilestones?: AddictionMilestoneAward[]; // lifetime awarded milestones ledger
  revokedAwardIds?: string[]; // grow-only set of revoked milestone award IDs
  createdAt: string;
}

export interface CravingLog {
  id: string;
  date: string; // ISO timestamp
  intensity: number; // 1 to 10
  trigger: string;
  copingStrategy: string;
  createdAt: string;
}

// Module 7: Prefrontal Cortex Module
export interface FocusSessionLog {
  id: string;
  date: string; // YYYY-MM-DD
  taskName: string;
  skillId?: string;
  durationMinutes: number;
  pointsAwarded: number;
  reflection?: string;
  createdAt: string;
}

export interface DecisionLog {
  id: string;
  title: string;
  rationale: string;
  expectedOutcome: string;
  revisitDate: string; // YYYY-MM-DD
  reflection?: string;
  isReflected: boolean;
  createdAt: string;
}

export interface EmotionLog {
  id: string;
  date: string; // ISO timestamp
  emotion: string;
  intensity: number; // 1 to 10
  context: string;
  pointsAwarded: number;
  createdAt: string;
}

export type WeeklyGoalPriority = 'high' | 'medium' | 'low';
export type WeeklyGoalLinkedModule = 'none' | 'habit' | 'exercise' | 'reading' | 'skill';

export interface WeeklyGoalItem {
  id: string;
  title: string;
  targetDescription?: string;
  priority: WeeklyGoalPriority;
  linkedModule?: WeeklyGoalLinkedModule;
  linkedItemId?: string;
  targetValue?: number;
  unit?: string;
  linkedMetricKey?: string;
  manualProgress?: number;
  completed: boolean;
  completedAt?: string;
  archived?: boolean;
  carriedOverFromWeekKey?: string;
  carriedOverFromGoalId?: string;
  carryOverDismissed?: boolean;
  createdAt: string;
  /** Legacy fields kept optional for backward compatibility */
  text?: string;
  done?: boolean;
}

export interface WeeklyGoalReflection {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  pointsAwarded: boolean;
}

export interface WeeklyGoal {
  id: string;
  weekKey: string; // e.g. 2026-W33
  goals: WeeklyGoalItem[];
  reflections?: WeeklyGoalReflection[];
  createdAt: string;
  /** Legacy fields kept optional for backward compatibility */
  insights?: string;
  isReviewed?: boolean;
}

// Social Features 1: Personal Improvement Plans
export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  completed: boolean;
}

export type PlanType = 'milestone' | 'target_goal' | 'habit_journey' | 'vision';

export const PLAN_CATEGORIES = [
  'Personal Growth',
  'Career',
  'Health',
  'Finance',
  'Relationships',
  'Learning',
] as const;

export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

export interface PlanReflectionNote {
  id: string;
  originalPlanId?: string;
  followedPlanId?: string;
  ownerId?: string;
  note: string;
  createdAt: string;
  date?: string;
  reviewCadence?: 'weekly' | 'monthly' | null;
}

export interface VisionReflectionNote {
  id: string;
  date: string;
  note: string;
}

export interface ImprovementPlan {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorAvatar?: string;
  creatorPoints?: number;
  title: string;
  description: string;
  category?: string;
  isPublic: boolean;
  steps: PlanStep[];
  copyCount: number;
  createdAt: string;

  // Phase B Plan Type Additions
  planType?: PlanType;
  // Target Goal fields
  targetValue?: number;
  targetUnit?: string;
  currentProgress?: number;
  targetDate?: string;
  // Habit Journey fields
  cadence?: 'daily' | 'weekly';
  duration?: number;
  startDate?: string;
  streakCount?: number;
  lastCompletedDate?: string;
  /** The completion before lastCompletedDate, restored by Undo so the streak survives it. */
  previousCompletedDate?: string;
  // Vision fields
  targetReviewDate?: string;
  reflectionNotes?: PlanReflectionNote[];

  // Phase C Review Loop Cadence
  reviewCadence?: 'weekly' | 'monthly' | null;
  nextReviewDueAt?: string | null;

  // Synchronization status (client-side/user_data JSONB only)
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export interface UserPlanFollow {
  id: string;
  userId: string;
  originalPlanId: string;
  /** The creator's username when it was copied, for "Copied from @user". */
  sourceUsername?: string;
  title: string;
  description: string;
  steps: PlanStep[];
  isCompleted: boolean;
  pointsAwarded: number;
  createdAt: string;

  // Phase B Plan Type Additions for Followed Copies
  planType?: PlanType;
  // Target Goal fields
  targetValue?: number;
  targetUnit?: string;
  currentProgress?: number;
  targetDate?: string;
  // Habit Journey fields
  cadence?: 'daily' | 'weekly';
  duration?: number;
  startDate?: string;
  streakCount?: number;
  lastCompletedDate?: string;
  /** The completion before lastCompletedDate, restored by Undo so the streak survives it. */
  previousCompletedDate?: string;
  // Vision fields
  targetReviewDate?: string;
  reflectionNotes?: PlanReflectionNote[];

  // Phase C Review Loop Cadence
  reviewCadence?: 'weekly' | 'monthly' | null;
  nextReviewDueAt?: string | null;

  // Synchronization status (client-side only)
  syncStatus?: 'pending' | 'synced' | 'failed';
}

// Social Features 2: Accountability Partner & Shared Challenges
export interface PartnerInvite {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  toUserId: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export type SharedChallengeCategory =
  | 'habit'
  | 'reading'
  | 'exercise'
  | 'bad_habit'
  | 'skill'
  | 'journal'
  | 'recovery';

export interface Partnership {
  id: string;
  user1Id: string;
  user1Username: string;
  user2Id: string;
  user2Username: string;
  pairedAt: string;
}

export interface SharedChallenge {
  id: string;
  partnershipId: string;
  title: string;
  targetHabitName: string;
  durationDays: number;
  jointStreak: number;
  totalJointDaysCompleted?: number;
  lastJointCompletionDate?: string;
  user1Category?: SharedChallengeCategory;
  user1Target?: string;
  user2Category?: SharedChallengeCategory;
  user2Target?: string;
  user1DoneDate?: string;
  user2DoneDate?: string;
  user1DoneDates?: string[];
  user2DoneDates?: string[];
  status: 'active' | 'completed' | 'broken' | 'expired';
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId?: string;
  actorUsername?: string;
  actorAvatar?: string;
  type: 'partner_invite' | 'partner_invite_accepted' | 'partner_invite_declined' | 'partner_removed' | 'challenge_deleted' | 'partner_nudge' | 'partner_pledge_done' | 'partner_missed_habit' | 'missed_habit' | 'challenge_completed' | string;
  title?: string;
  message: string;
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// Module: Projects & Goals Hierarchy
export type GoalStatus = 'active' | 'achieved' | 'abandoned';
export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  dueDate?: string; // YYYY-MM-DD
  priority: TaskPriority;
  completed: boolean;
  subtasks: TaskSubtask[];
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  goalId?: string;
  startDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  status: ProjectStatus;
  completedAt?: string; // ISO string timestamp when status became 'completed'
  manualProgress?: number; // 0-100 when project has 0 tasks
  order?: number; // Sequence index when linked to a sequential Goal
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category?: string;
  targetDate?: string; // YYYY-MM-DD
  status: GoalStatus;
  manualProgress?: number; // 0-100 when goal has 0 linked projects
  sequentialMode?: boolean; // When true, linked projects must be completed in order
  createdAt: string;
}

export interface AppState {
  currentUser: UserProfile | null;
  habits: Habit[];
  journalEntries: JournalEntry[];
  seasonId: number;
  seasonPoints: number;
  /** DEPRECATED: Mirrored alias for seasonPoints to maintain backward compatibility */
  totalPoints?: number;
  /** Points ledger entries for history */
  pointsHistory: PointsEntry[];
  /** League archives — final standings from completed periods */
  leagueArchives: LeagueArchive[];
  /** IDs of lessons the user has read */
  readLessonIds: string[];
  /** Username for league display */
  username: string;

  // New modules state
  workouts: WorkoutLog[];
  exerciseGoal?: ExerciseGoal | null;
  // Unified Reading Hub & Literature Module
  libraryBooks: UserBook[];
  readingLogs: ReadingLog[];
  /** @deprecated Legacy books array. All reading data is migrated to libraryBooks and cleared on next sync */
  books: Book[];
  skills: Skill[];
  skillLogs: SkillSessionLog[];
  badHabits: BadHabit[];
  badHabitLogs: BadHabitLog[];
  addictionTracker: AddictionTracker | null;
  cravingLogs: CravingLog[];
  focusLogs: FocusSessionLog[];
  decisionLogs: DecisionLog[];
  emotionLogs: EmotionLog[];
  weeklyGoals: WeeklyGoal[];

  // Projects & Goals Module
  goals: Goal[];
  projects: Project[];
  tasks: Task[];

  // Social features state
  improvementPlans: ImprovementPlan[];
  followedPlans: UserPlanFollow[];
  partnerInvites: PartnerInvite[];
  partnership: Partnership | null;
  partnerships: Partnership[];
  sharedChallenges: SharedChallenge[];
  notifications: AppNotification[];

  // Tombstones for offline sync & deletion preservation
  deletedEntityIds?: string[];
  restoredEntityIds?: string[];

  // Time Tracker Module
  timeTracker?: TimeTrackerState;

  // Theme Preference
  themePreference?: 'dark' | 'light';

  /** Highest rank already celebrated this season (lib/rankCelebration); null until first set. */
  rankCelebrated?: RankCelebrated | null;
}

/** Rank-up memory: `tierIndex` into TIERS, celebrated in `season`. */
export interface RankCelebrated {
  season: number;
  tierIndex: number;
}

export interface TimeTrackerActivity {
  id: string;
  name: string;
  color: string;
  icon: string;
  isSystemDefault: boolean;
  ascendModule?: string; // 'Exercise' | 'Reading' | 'Deep Focus' | 'Habits' | 'Skills' | 'Journal' | 'Recovery'
  createdAt?: string;
  updatedAt?: string;
}

export interface TimeTrackerBlock {
  id: string;
  startTime: string; // "HH:mm" in 24h format (e.g. "09:30")
  endTime: string;   // "HH:mm" in 24h format (e.g. "11:00"); "24:00" = ends at midnight
  /** Shared by the two halves of a block that crosses midnight (one on each day). */
  splitPairId?: string;
  originalStartTime?: string; // Saved when pulled forward / started early
  originalEndTime?: string;   // Saved when shifted (early start)
  trimmedOriginalEndTime?: string; // Saved specifically when completed early and trimmed
  pulledForwardTriggerId?: string; // ID of the early-resolved block that caused the gap
  trimmedDueToPullId?: string;     // ID of the pulled-forward block that caused this block to be trimmed
  activityId: string;
  secondaryActivityIds?: string[];
  customTitle?: string;
  completed?: boolean;
  completedAt?: string;
  skipped?: boolean;
  skippedAt?: string;
  breakDurationMinutes?: number; // Chosen break length (up to 15 min cap)
  breakStartedAt?: string;       // ISO timestamp when break started
  breakEndedAt?: string;         // ISO timestamp if ended early
  notes?: string;
  createdAt?: string | number;
  updatedAt?: string;
}

export interface TimeTrackerTemplate {
  id: string;
  title: string;
  blocks: TimeTrackerBlock[];
  activeDays: string[]; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  autoApplyDays?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Sync bookkeeping for one day (travels with the day's row). */
export interface TimeTrackerDayMeta {
  /** When the day was last edited on a device (the real edit time, not the upload time). */
  updatedAt?: string;
  /** Blocks removed from the day, so a merge with another device's copy never brings them back. */
  deletedBlockIds?: string[];
}

export interface TimeTrackerState {
  activities: TimeTrackerActivity[];
  templates: TimeTrackerTemplate[];
  dailyLogs: Record<string, TimeTrackerBlock[]>;
  clearedDates?: string[];
  dayMeta?: Record<string, TimeTrackerDayMeta>;
}

export const DEFAULT_TIME_TRACKER_ACTIVITIES: TimeTrackerActivity[] = [
  {
    id: 'act-sleep',
    name: 'Sleep',
    color: '#6366f1', // Indigo
    icon: 'Moon',
    isSystemDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-deep-work',
    name: 'Deep Work',
    color: '#10b981', // Emerald (brand)
    icon: 'BrainCircuit',
    isSystemDefault: true,
    ascendModule: 'Deep Focus',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-praying',
    name: 'Praying',
    color: '#a855f7', // Purple
    icon: 'HeartHandshake',
    isSystemDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-exercise',
    name: 'Exercise',
    color: '#ef4444', // Red
    icon: 'Activity',
    isSystemDefault: true,
    ascendModule: 'Exercise',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-reading',
    name: 'Reading',
    color: '#3b82f6', // Blue
    icon: 'BookOpen',
    isSystemDefault: true,
    ascendModule: 'Reading',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-skills',
    name: 'Skills',
    color: '#06b6d4', // Cyan
    icon: 'Sparkles',
    isSystemDefault: true,
    ascendModule: 'Skills',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-break',
    name: 'Break',
    color: '#64748b', // Slate
    icon: 'Coffee',
    isSystemDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-meals',
    name: 'Meals',
    color: '#f97316', // Orange
    icon: 'Utensils',
    isSystemDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-entertainment',
    name: 'Entertainment',
    color: '#ec4899', // Pink
    icon: 'Gamepad2',
    isSystemDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'act-walking',
    name: 'Walking',
    color: '#22c55e', // Green
    icon: 'Footprints',
    isSystemDefault: true,
    ascendModule: 'Exercise',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Ascend's recommended day (new accounts get it as their default template; existing users can add
 * it from Templates). Sleep 23:00-07:00 is stored as its two halves so each day starts and ends
 * with it: 00:00-07:00 in the morning and 23:00-24:00 at night. Gaps are free time on purpose.
 */
export const ASCEND_RECOMMENDED_DAY_TITLE = 'Ascend recommended day';
export const ASCEND_RECOMMENDED_DAY_BLOCKS: TimeTrackerBlock[] = [
  { id: 'tpl-rec-sleep-morning', startTime: '00:00', endTime: '07:00', activityId: 'act-sleep', customTitle: 'Sleep' },
  { id: 'tpl-rec-morning-prayer', startTime: '07:00', endTime: '07:30', activityId: 'act-praying', customTitle: 'Morning prayer and routine' },
  { id: 'tpl-rec-workout', startTime: '07:30', endTime: '08:15', activityId: 'act-exercise', customTitle: 'Workout' },
  { id: 'tpl-rec-breakfast', startTime: '08:15', endTime: '08:45', activityId: 'act-meals', customTitle: 'Breakfast' },
  { id: 'tpl-rec-deep-work-1', startTime: '09:00', endTime: '10:30', activityId: 'act-deep-work', customTitle: 'Deep work' },
  { id: 'tpl-rec-break-1', startTime: '10:30', endTime: '10:45', activityId: 'act-break', customTitle: 'Short break' },
  { id: 'tpl-rec-deep-work-2', startTime: '10:45', endTime: '12:15', activityId: 'act-deep-work', customTitle: 'Deep work' },
  { id: 'tpl-rec-lunch', startTime: '12:15', endTime: '13:15', activityId: 'act-meals', customTitle: 'Lunch and rest' },
  { id: 'tpl-rec-walk', startTime: '13:15', endTime: '13:45', activityId: 'act-walking', customTitle: 'Walk outside' },
  { id: 'tpl-rec-deep-work-3', startTime: '14:00', endTime: '15:30', activityId: 'act-deep-work', customTitle: 'Deep work' },
  { id: 'tpl-rec-break-2', startTime: '15:30', endTime: '15:45', activityId: 'act-break', customTitle: 'Short break' },
  { id: 'tpl-rec-skills', startTime: '15:45', endTime: '16:45', activityId: 'act-skills', customTitle: 'Skill practice' },
  { id: 'tpl-rec-dinner', startTime: '19:00', endTime: '20:00', activityId: 'act-meals', customTitle: 'Dinner with family' },
  { id: 'tpl-rec-free-time', startTime: '20:00', endTime: '21:00', activityId: 'act-entertainment', customTitle: 'Free time' },
  { id: 'tpl-rec-reading', startTime: '21:00', endTime: '21:45', activityId: 'act-reading', customTitle: 'Reading' },
  { id: 'tpl-rec-wind-down', startTime: '22:30', endTime: '23:00', activityId: 'act-praying', customTitle: 'Night prayer and wind-down' },
  { id: 'tpl-rec-sleep-night', startTime: '23:00', endTime: '24:00', activityId: 'act-sleep', customTitle: 'Sleep' },
];

export const DEFAULT_TIME_TRACKER_STATE: TimeTrackerState = {
  activities: DEFAULT_TIME_TRACKER_ACTIVITIES,
  templates: [
    {
      id: 'template-default-weekday',
      title: ASCEND_RECOMMENDED_DAY_TITLE,
      activeDays: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      blocks: ASCEND_RECOMMENDED_DAY_BLOCKS,
    },
  ],
  dailyLogs: {},
  clearedDates: [],
};

export const DEFAULT_STATE: AppState = {
  currentUser: null,
  habits: [],
  journalEntries: [],
  seasonId: 1,
  seasonPoints: 0,
  totalPoints: 0,
  pointsHistory: [],
  leagueArchives: [],
  readLessonIds: [],
  username: 'Guest User',
  workouts: [],
  exerciseGoal: null,
  books: [],
  readingLogs: [],
  skills: [],
  skillLogs: [],
  badHabits: [],
  badHabitLogs: [],
  addictionTracker: null,
  cravingLogs: [],
  focusLogs: [],
  decisionLogs: [],
  emotionLogs: [],
  weeklyGoals: [],
  goals: [],
  projects: [],
  tasks: [],
  libraryBooks: [],
  improvementPlans: [],
  followedPlans: [],
  partnerInvites: [],
  partnership: null,
  partnerships: [],
  sharedChallenges: [],
  notifications: [],
  deletedEntityIds: [],
  restoredEntityIds: [],
  timeTracker: DEFAULT_TIME_TRACKER_STATE,
  themePreference: 'dark',
  rankCelebrated: null,
};


