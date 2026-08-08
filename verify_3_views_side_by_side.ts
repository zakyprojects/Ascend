import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { getHighestUserStreak } from './src/lib/habitPenalties';
import { reconstructStateFromProfile, getRegisteredCompetitors } from './src/lib/auth';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) envVars[k.trim()] = v.trim();
});

const url = envVars.VITE_SUPABASE_URL || '';
const key = envVars.VITE_SUPABASE_ANON_KEY || '';
const client = createClient(url, key);

async function verify3Views() {
  console.log('=== VERIFYING ALL 3 VIEWS SIDE-BY-SIDE (DASHBOARD vs MODAL-OTHER vs MODAL-SELF) ===\n');

  const usernames = ['asdf', 'qwer', 'YousafKhan'];

  const { data: profiles } = await client
    .from('profiles')
    .select('id, username, uid, stats, points_history, active_habits, is_profile_public, avatar, total_points');

  for (const username of usernames) {
    const p = profiles?.find((prof) => prof.username === username);
    if (!p) continue;

    const { data: userDataRows } = await client
      .from('user_data')
      .select('state')
      .eq('user_id', p.id);

    const userState = userDataRows?.[0]?.state;

    // View 1: Dashboard View
    let dashboardStreak: any;
    if (userState) {
      dashboardStreak = getHighestUserStreak(userState);
    } else {
      const reconState = reconstructStateFromProfile(p);
      dashboardStreak = getHighestUserStreak(reconState);
    }

    // View 2: Modal View as Other Member (getRegisteredCompetitors)
    const otherCompetitors = getRegisteredCompetitors('weekly', undefined, new Date(), [p]);
    const modalOtherStreak = otherCompetitors[0]?.stats;

    // View 3: Modal View as Logged-In Self ("You" badge path via store getLeagueData userStats)
    const selfState = userState || reconstructStateFromProfile(p);
    const selfStreakInfo = getHighestUserStreak(selfState);

    console.log(`USER: "${username}"`);
    console.log(`  1. Dashboard View:       ${dashboardStreak.days}d (${dashboardStreak.source})`);
    console.log(`  2. Modal (Other User):    ${modalOtherStreak?.streakDays} days — ${modalOtherStreak?.streakSource}`);
    console.log(`  3. Modal (Self / "You"):  ${selfStreakInfo.days} days — ${selfStreakInfo.source}`);

    const allMatch =
      dashboardStreak.days === modalOtherStreak?.streakDays &&
      dashboardStreak.days === selfStreakInfo.days &&
      dashboardStreak.source === selfStreakInfo.source;

    console.log(`  Status: ${allMatch ? '✅ ALL 3 VIEWS MATCH 100% IDENTICALLY!' : '❌ MISMATCH DETECTED!'}\n`);
  }
}

verify3Views().catch(console.error);
