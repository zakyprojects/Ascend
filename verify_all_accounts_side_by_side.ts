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

async function verifySideBySide() {
  console.log('=== SIDE-BY-SIDE VERIFICATION OF DASHBOARD vs MODAL STREAKS ===\n');

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

    // 1. Dashboard streak calculation (getHighestUserStreak)
    let dashboardStreak: any;
    if (userState) {
      dashboardStreak = getHighestUserStreak(userState);
    } else {
      const reconState = reconstructStateFromProfile(p);
      dashboardStreak = getHighestUserStreak(reconState);
    }

    // 2. Modal streak calculation (via getRegisteredCompetitors)
    const competitors = getRegisteredCompetitors('weekly', undefined, new Date(), [p]);
    const modalStreak = competitors[0]?.stats;

    console.log(`User: "${username}"`);
    console.log(`  Dashboard Value: ${dashboardStreak.days}d (${dashboardStreak.source})`);
    console.log(`  Modal Value:     ${modalStreak?.streakDays} days — ${modalStreak?.streakSource}`);
    console.log(`  Match Status:    ${dashboardStreak.days === modalStreak?.streakDays ? '✅ IDENTICAL MATCH!' : '❌ MISMATCH!'}\n`);
  }
}

verifySideBySide().catch(console.error);
