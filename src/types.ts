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
  notifLeagueUpdates?: boolean;
  notifSundayPlanning?: boolean;
  /** Whether the user is currently an anonymous guest account */
  isAnonymous?: boolean;
  /** ISO timestamp string of the last username change */
  lastUsernameChangeAt?: string;
  /** Past season history and trophy badges */
  season_history?: Array<{ seasonName: string; points: number; date: string }>;
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
  season_history?: Array<{ seasonName: string; points: number; date: string }>;
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
  /** ISO date strings (YYYY-MM-DD) or week keys of completed periods */
  completions: string[];
  createdAtPeriod: string;
  /** Periods that were missed and penalized */
  missedPeriods?: string[];
  /** Consecutive missed periods count (resets to 0 upon completion) */
  consecutiveMisses?: number;
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
  totalPoints: number; // overall lifetime points driving overall tier
  isUser?: boolean;
  isRealUser?: boolean;
  isSeed?: boolean;
  isProfilePublic?: boolean;
  stats?: UserStats;
  activeHabits?: { name: string; category?: string; frequency: string; isPreset: boolean }[];
  season_history?: Array<{ seasonName: string; points: number; date: string }>;
}

export interface LeagueArchive {
  type: LeagueType;
  periodLabel: string;
  competitors: LeagueCompetitor[];
  userRank: number;
  userPoints: number;
  archivedAt: string;
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
  /** Lifetime total points (drives tier, never resets) */
  totalPoints: number;
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
export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  type: string; // e.g., 'Running', 'Cycling', 'Weightlifting', etc.
  durationMinutes: number;
  pointsAwarded: number;
  createdAt: string;
}

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
  consecutiveMisses?: number;
  lastPenalizedDate?: string;
}

export interface ExerciseGoal {
  targetWeeklySessions: number;
  consecutiveMisses?: number;
  lastEvaluatedWeek?: string;
}

export interface ReadingGoal {
  cadence: 'daily' | 'weekly';
  targetPages?: number;
  consecutiveMisses?: number;
  lastEvaluatedPeriod?: string;
}

export interface ReadingProgressLog {
  id: string;
  bookId: string;
  date: string; // YYYY-MM-DD
  progressAmount: number; // pages/chapters added in this session
  pointsAwarded: number;
  createdAt: string;
}

// Self Improvement Books - Curated Library & User Library
export type BookCategory =
  | 'Habits'
  | 'Mindset'
  | 'Productivity'
  | 'Discipline'
  | 'Finance'
  | 'Relationships'
  | 'Spirituality';

export type UserBookStatus = 'to-read' | 'reading' | 'completed';

export interface CuratedBook {
  id: string;
  title: string;
  author: string;
  description: string;
  category: BookCategory;
  coverImageUrl?: string;
  isCurated: true;
  pointsOnCompletion: number;
}

export interface UserBook {
  id: string;
  curatedBookId?: string;
  title: string;
  author: string;
  description?: string;
  category?: BookCategory;
  coverImageUrl?: string;
  isCustom: boolean;
  status: UserBookStatus;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  pointsAwarded: number;
  linkedBookId?: string;
}

// Module 3: Skill Learning Tracker
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Skill {
  id: string;
  name: string;
  category?: string;
  manualLevel?: SkillLevel;
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
  commitmentDays: number;
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
}

// Module 5: Addiction Recovery Tracker
export interface AddictionTracker {
  id: string;
  title: string;
  startDate: string; // ISO timestamp
  milestonesUnlocked: string[]; // ['24h', '1w', '1m']
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
  manualProgress?: number;
  completed: boolean;
  archived?: boolean;
  carriedOverFromWeekKey?: string;
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
  // Vision fields
  targetReviewDate?: string;
  reflectionNotes?: PlanReflectionNote[];

  // Phase C Review Loop Cadence
  reviewCadence?: 'weekly' | 'monthly' | null;
  nextReviewDueAt?: string | null;
}

export interface UserPlanFollow {
  id: string;
  userId: string;
  originalPlanId: string;
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
  // Vision fields
  targetReviewDate?: string;
  reflectionNotes?: PlanReflectionNote[];

  // Phase C Review Loop Cadence
  reviewCadence?: 'weekly' | 'monthly' | null;
  nextReviewDueAt?: string | null;
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
  user1AllowStats?: boolean;
  user2AllowStats?: boolean;
  pairedAt: string;
}

export interface SharedChallenge {
  id: string;
  partnershipId: string;
  title: string;
  targetHabitName: string;
  durationDays: number;
  jointStreak: number;
  user1Category?: SharedChallengeCategory;
  user1Target?: string;
  user2Category?: SharedChallengeCategory;
  user2Target?: string;
  user1DoneDate?: string;
  user2DoneDate?: string;
  status: 'active' | 'completed' | 'broken';
  createdAt: string;
}

export interface PartnerNotification {
  id: string;
  userId: string;
  partnerId: string;
  partnerUsername: string;
  message: string;
  habitName?: string;
  type: 'missed_habit' | 'challenge_update' | 'invite';
  read: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId?: string;
  actorUsername?: string;
  actorAvatar?: string;
  type: 'partner_invite' | 'partner_invite_accepted' | 'partner_invite_declined' | 'partner_nudge' | 'missed_habit' | 'challenge_completed' | string;
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
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category?: string;
  targetDate?: string; // YYYY-MM-DD
  status: GoalStatus;
  createdAt: string;
}

export interface AppState {
  currentUser: UserProfile | null;
  habits: Habit[];
  journalEntries: JournalEntry[];
  /** Lifetime total points (drives tier, never resets) */
  totalPoints: number;
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
  books: Book[];
  readingLogs: ReadingProgressLog[];
  readingGoal?: ReadingGoal | null;
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

  // Self Improvement Books Library
  libraryBooks: UserBook[];

  // Social features state
  improvementPlans: ImprovementPlan[];
  followedPlans: UserPlanFollow[];
  partnerInvites: PartnerInvite[];
  partnership: Partnership | null;
  partnerships: Partnership[];
  sharedChallenges: SharedChallenge[];
  partnerNotifications: PartnerNotification[];
  notifications: AppNotification[];
}

export const DEFAULT_STATE: AppState = {
  currentUser: null,
  habits: [],
  journalEntries: [],
  totalPoints: 0,
  pointsHistory: [],
  leagueArchives: [],
  readLessonIds: [],
  username: 'Guest User',
  workouts: [],
  exerciseGoal: null,
  books: [],
  readingLogs: [],
  readingGoal: null,
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
  partnerNotifications: [],
  notifications: [],
};



