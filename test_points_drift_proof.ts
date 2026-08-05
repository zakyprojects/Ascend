import * as fs from 'fs';
import * as path from 'path';

export interface PointsEntry {
  id: string;
  amount: number;
  reason: string;
  source: string;
  timestamp: string;
}

/** Start of the current week (Monday at 00:00:00) */
export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Corrected calculatePeriodPoints function (sums additions AND deductions) */
export function calculatePeriodPoints(pointsHistory: PointsEntry[], start: Date, end: Date = new Date()): number {
  const sum = (pointsHistory || [])
    .filter((entry) => {
      const ts = new Date(entry.timestamp);
      return ts >= start && ts <= end;
    })
    .reduce((acc, entry) => acc + (entry.amount || 0), 0);
  return Math.max(0, sum);
}

function uid(): string {
  return Math.random().toString(36).substring(2, 11);
}

function addPointsInternal(
  prevTotal: number,
  prevHistory: PointsEntry[],
  amount: number,
  reason: string,
  source: string
) {
  const newHistory: PointsEntry[] = [
    {
      id: uid(),
      amount,
      reason,
      source,
      timestamp: new Date().toISOString(),
    },
    ...prevHistory,
  ];

  const historySum = newHistory.reduce((acc, entry) => acc + (entry.amount || 0), 0);
  const reconciledTotal = Math.max(0, historySum);

  return {
    totalPoints: reconciledTotal,
    pointsHistory: newHistory,
  };
}

async function runPointsDriftTest() {
  console.log('======================================================================');
  console.log('   EMPIRICAL PROOF TEST: LEAGUE VS PROFILE POINTS DRIFT RECONCILIATION');
  console.log('======================================================================\n');

  const startOfWeekDate = startOfWeek();
  console.log(`Weekly League Period Start: ${startOfWeekDate.toISOString()}`);

  let currentTotalPoints = 0;
  let currentPointsHistory: PointsEntry[] = [];

  // Step 1: User earns points (completes preset habit worth 50 points)
  console.log('\n--- STEP 1: Completing preset habit (+50 pts) ---');
  let update = addPointsInternal(currentTotalPoints, currentPointsHistory, 50, 'Completed habit: Morning Workout', 'habit');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  let profileDisplayPoints = currentTotalPoints;
  let leagueDisplayPoints = calculatePeriodPoints(currentPointsHistory, startOfWeekDate);

  console.log(`Profile/Rank Card Points: ${profileDisplayPoints}`);
  console.log(`League Leaderboard Points: ${leagueDisplayPoints}`);
  console.log(`Do Profile and League Points Match? ${profileDisplayPoints === leagueDisplayPoints ? 'YES ✅' : 'NO ❌'}`);

  // Step 2: User unchecks/deletes habit (-50 pts)
  console.log('\n--- STEP 2: Unchecking/deleting habit (-50 pts) ---');
  update = addPointsInternal(currentTotalPoints, currentPointsHistory, -50, 'Unchecked habit: Morning Workout', 'habit');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  profileDisplayPoints = currentTotalPoints;
  leagueDisplayPoints = calculatePeriodPoints(currentPointsHistory, startOfWeekDate);

  console.log(`Profile/Rank Card Points: ${profileDisplayPoints}`);
  console.log(`League Leaderboard Points: ${leagueDisplayPoints}`);
  console.log(`Do Profile and League Points Match AFTER Deduction? ${profileDisplayPoints === leagueDisplayPoints ? 'YES ✅' : 'NO ❌'}`);

  // Step 3: User logs workout (+30 pts) and finishes book (+30 pts)
  console.log('\n--- STEP 3: Logging Workout (+30 pts) and Finishing Book (+30 pts) ---');
  update = addPointsInternal(currentTotalPoints, currentPointsHistory, 30, 'Workout logged: Running (30m)', 'exercise');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  update = addPointsInternal(currentTotalPoints, currentPointsHistory, 30, 'Book finished: Meditations', 'reading_bonus');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  profileDisplayPoints = currentTotalPoints;
  leagueDisplayPoints = calculatePeriodPoints(currentPointsHistory, startOfWeekDate);

  console.log(`Profile/Rank Card Points: ${profileDisplayPoints}`);
  console.log(`League Leaderboard Points: ${leagueDisplayPoints}`);
  console.log(`Do Profile and League Points Match? ${profileDisplayPoints === leagueDisplayPoints ? 'YES ✅' : 'NO ❌'}`);

  // Step 4: User deletes workout (-30 pts)
  console.log('\n--- STEP 4: Deleting Workout (-30 pts) ---');
  update = addPointsInternal(currentTotalPoints, currentPointsHistory, -30, 'Workout deleted: Running', 'exercise');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  profileDisplayPoints = currentTotalPoints;
  leagueDisplayPoints = calculatePeriodPoints(currentPointsHistory, startOfWeekDate);

  console.log(`Profile/Rank Card Points: ${profileDisplayPoints}`);
  console.log(`League Leaderboard Points: ${leagueDisplayPoints}`);
  console.log(`Do Profile and League Points Match AFTER Deleting Workout? ${profileDisplayPoints === leagueDisplayPoints ? 'YES ✅' : 'NO ❌'}`);

  // Step 5: User deletes finished book (-30 pts)
  console.log('\n--- STEP 5: Deleting Finished Book (-30 pts) ---');
  update = addPointsInternal(currentTotalPoints, currentPointsHistory, -30, 'Book deleted: Meditations', 'reading');
  currentTotalPoints = update.totalPoints;
  currentPointsHistory = update.pointsHistory;

  profileDisplayPoints = currentTotalPoints;
  leagueDisplayPoints = calculatePeriodPoints(currentPointsHistory, startOfWeekDate);

  console.log(`Profile/Rank Card Points: ${profileDisplayPoints}`);
  console.log(`League Leaderboard Points: ${leagueDisplayPoints}`);
  console.log(`Do Profile and League Points Match AFTER Deleting Book? ${profileDisplayPoints === leagueDisplayPoints ? 'YES ✅' : 'NO ❌'}`);

  // Step 6: Test Reconciliation on the user account shown in the user's prompt (Profile 45 vs League 180)
  console.log('\n--- STEP 6: Testing Retroactive Reconciliation on User Account (Profile 45 vs League 180) ---');
  const driftedHistory: PointsEntry[] = [
    { id: '1', amount: 100, reason: 'Preset Habit Completed', source: 'habit', timestamp: new Date().toISOString() },
    { id: '2', amount: 80, reason: 'Book Finished', source: 'reading', timestamp: new Date().toISOString() },
    { id: '3', amount: -100, reason: 'Habit Deleted', source: 'habit', timestamp: new Date().toISOString() },
    { id: '4', amount: -35, reason: 'Unchecked Habit', source: 'habit', timestamp: new Date().toISOString() },
  ];

  // Faulty Old calculation (ignored amount > 0)
  const faultyLeaguePoints = driftedHistory
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + entry.amount, 0); // 180

  const correctedLeaguePoints = calculatePeriodPoints(driftedHistory, startOfWeekDate); // 45
  const correctedTotalPoints = Math.max(0, driftedHistory.reduce((sum, entry) => sum + (entry.amount || 0), 0)); // 45

  console.log(`Faulty Old League Points: ${faultyLeaguePoints}`);
  console.log(`Corrected Reconciled League Points: ${correctedLeaguePoints}`);
  console.log(`Corrected Reconciled Profile Total Points: ${correctedTotalPoints}`);
  console.log(`Are Reconciled League and Profile Points 100% Identical? ${correctedLeaguePoints === correctedTotalPoints ? 'YES ✅' : 'NO ❌'}`);

  console.log('\n======================================================================');
  console.log('                 PROOF VERIFICATION COMPLETE                         ');
  console.log('======================================================================');
}

runPointsDriftTest();
