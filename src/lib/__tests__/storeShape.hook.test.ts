// Hook test (real useAppState + in-process fake Supabase, see harness/): the store's public shape.
// Written for C2 (splitting useAppState into domain hooks): a domain moved into its own hook must keep
// every member, the member order, and each action's identity across renders.
//   T17  useAppState returns exactly the members it returned at ef21c97, in the same order; after an
//        unrelated state change only `state` changes identity (every action keeps its useCallback identity).
import { bootHook, story, until, quiet, eq, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

// Object.keys(useAppState()) at ef21c97 (the 175 members, in order), plus refreshNow (pull-to-refresh),
// firstLoadFailed / retryFirstLoad (the failed-first-load gate) and isLeagueStandingsStale (Leagues'
// "couldn't refresh" line).
const MEMBERS = [
  'state', 'isAuthChecking', 'isSessionLoading', 'isServerDataApplied', 'firstLoadFailed', 'retryFirstLoad', 'setRankCelebrated',
  'setLastSeenRelease', 'storedSessionWait', 'logout', 'deleteAccount', 'logoutGuest', 'addPresetHabit',
  'addCustomHabit', 'renameHabit', 'deleteHabit', 'toggleHabit', 'toggleReadingHabit', 'isHabitDone',
  'saveJournalEntry', 'deleteJournalEntry', 'editJournalEntry', 'getTodayJournalEntry', 'markLessonRead',
  'setUsername', 'updateProfileUsername', 'updateProfileAvatar', 'resolvedTheme', 'setThemePreference',
  'toggleThemePreference', 'toggleProfilePrivacy', 'toggleAcceptPartnerInvites',
  'toggleNotificationPreference', 'getLeagueData', 'refreshLeagueStandings', 'isLeagueStandingsStale', 'getLeagueStandingsStatus',
  'logWorkout', 'deleteWorkout', 'updateWorkout', 'clearWorkoutsBefore', 'updateReadingProgress',
  'finishBook', 'deleteBook', 'addSkill', 'logSkillPractice', 'updateSkill', 'deleteSkill', 'deleteSkillLog',
  'updateSkillLog', 'clearSkillLogsBefore', 'updateSkillDrill', 'deleteSkillDrill', 'addBadHabit',
  'logBadHabitDay', 'undoTodayBadHabitLog', 'deleteBadHabit', 'renameBadHabit', 'setAddictionTracker',
  'renameAddictionTracker', 'deleteAddictionTracker', 'resetAddictionStreak', 'checkAddictionMilestones',
  'checkInRecovery', 'undoRecoveryCheckin', 'logCraving', 'deleteCravingLog', 'clearCravingLogsBefore',
  'logFocusSession', 'updateFocusLogReflection', 'updateFocusLogText', 'deleteFocusLog', 'addDecision',
  'reflectDecision', 'deleteDecisionLog', 'updateDecisionText', 'logEmotion', 'deleteEmotionLog',
  'updateEmotionNote', 'addWeeklyReflection', 'updateWeeklyReflection', 'deleteWeeklyReflection',
  'addWeeklyGoalItem', 'updateWeeklyGoalItem', 'deleteWeeklyGoalItem', 'carryOverGoal',
  'syncLinkedWeeklyGoals', 'addCuratedBookToLibrary', 'addCustomBookToLibrary', 'updateUserBookStatus',
  'updateBookDetails', 'restartBook', 'createImprovementPlan', 'updateImprovementPlan', 'updateFollowedPlan',
  'togglePlanVisibility', 'updateTargetGoalProgress', 'setNewTargetGoal', 'markHabitJourneyDone',
  'undoHabitJourneyDone', 'addVisionReflectionNote', 'editVisionReflectionNote',
  'deleteVisionReflectionNote', 'completeFollowedPlanStep', 'updateFollowedTargetGoalProgress',
  'setNewFollowedTargetGoal', 'markFollowedHabitJourneyDone', 'undoFollowedHabitJourneyDone',
  'addFollowedVisionReflectionNote', 'editFollowedVisionReflectionNote',
  'deleteFollowedVisionReflectionNote', 'copyPublicPlan', 'updatePlanCopyCount', 'deleteFollowedPlan',
  'completePlanStep', 'deletePlan', 'sendPartnerInvite', 'acceptPartnerInvite', 'cancelPartnerInvite',
  'declinePartnerInvite', 'endPartnership', 'getPartnerProfileStats', 'createSharedChallenge',
  'logSharedChallengeHabit', 'deleteSharedChallenge', 'markNotificationRead', 'markNotificationsRead',
  'markAllNotificationsRead', 'clearNotifications', 'clearReadNotifications', 'refreshNotifications',
  'notificationsStatus', 'refreshPartners', 'partnersStatus', 'refreshNow', 'createGoal', 'updateGoal', 'deleteGoal',
  'createProject', 'updateProject', 'saveProjectOrder', 'saveListOrder', 'deleteProject', 'createTask',
  'updateTask', 'toggleTaskCompleted', 'deleteTask', 'toggleSubtask', 'addSubtask', 'deleteSubtask',
  'renameSubtask', 'reorderSubtasks', 'addTimeTrackerActivity', 'updateTimeTrackerActivity',
  'deleteTimeTrackerActivity', 'createTimeTrackerTemplate', 'updateTimeTrackerTemplate',
  'previewTemplateEditReach', 'deleteTimeTrackerTemplate', 'toggleTemplateAutoApplyDay', 'addDailyTimeBlock',
  'updateDailyTimeBlock', 'deleteDailyTimeBlock', 'toggleDailyTimeBlockCompleted',
  'markDailyTimeBlockSkipped', 'undoDailyTimeBlockResolution', 'undoEarlyStartTimeBlock',
  'pullForwardDailyTimeBlock', 'startDailyBlockBreak', 'endDailyBlockBreakEarly',
  'finalizeDailyBlockBreakNatural', 'keepTemplatePreview', 'applyTemplateToDate', 'clearDailyTimeBlocks',
  'hydrateTimeTrackerForDate', 'destructiveWipeModal', 'isSavingDestructiveWipe',
  'handleConfirmDestructiveWipe', 'handleCancelDestructiveWipe',
];
// Members whose identity changes on any state change at ef21c97 (they depend on `state` or are values).
const CHANGING = ['state'];

await story('storeShape.hook (useAppState members, order, identity)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);

  // T17
  eq(Object.keys(h.s()), MEMBERS, 'T17: useAppState members and their order unchanged');
  const before = h.s();
  h.s().setLastSeenRelease(101);
  await until(() => h.s().state.lastSeenRelease === 101, 'unrelated edit on screen');
  const after = h.s();
  assert(after !== before, 'T17 precondition: a new render happened');
  const changed = MEMBERS.filter((k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]);
  eq(changed, CHANGING, 'T17: only the members that depend on state change identity on a re-render');
  pass('T17 store shape and member identity unchanged');
});
