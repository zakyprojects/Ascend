import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function cleanupAndInspectDB() {
  console.log('=== 1. Inspecting Live Partnerships ===');
  const { data: partnerships, error: pErr } = await supabase.from('partnerships').select('*');
  console.log('Existing Partnerships count:', partnerships?.length, 'Err:', pErr);
  if (partnerships) {
    console.log(partnerships);
  }

  console.log('\n=== 2. Inspecting Live Partner Invites ===');
  const { data: invites, error: iErr } = await supabase.from('partner_invites').select('*');
  console.log('Existing Partner Invites count:', invites?.length, 'Err:', iErr);
  if (invites) {
    console.log(invites);
  }

  // Deduplicate partnerships if any duplicates exist
  if (partnerships && partnerships.length > 1) {
    const seen = new Set();
    const toDelete = [];
    for (const p of partnerships) {
      const pairKey = [p.user1_username.toLowerCase(), p.user2_username.toLowerCase()].sort().join('_');
      if (seen.has(pairKey)) {
        toDelete.push(p.id);
      } else {
        seen.add(pairKey);
      }
    }

    if (toDelete.length > 0) {
      console.log(`Cleaning up ${toDelete.length} duplicate partnerships:`, toDelete);
      for (const id of toDelete) {
        await supabase.from('partnerships').delete().eq('id', id);
      }
    }
  }

  console.log('\n=== Database Inspection & Cleanup Complete ===');
}

cleanupAndInspectDB().catch(console.error);
