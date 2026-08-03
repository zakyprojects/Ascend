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

console.log('Connecting to Supabase URL:', url);
const supabase = createClient(url, key);

async function main() {
  console.log('\n=== 1. QUERYING PUBLIC.PROFILES ===');
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, avatar, uid, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (profErr) {
    console.error('Error fetching profiles:', profErr);
  } else {
    console.log(`Fetched ${profiles ? profiles.length : 0} profile rows:`);
    console.log(JSON.stringify(profiles, null, 2));
  }

  console.log('\n=== 2. TESTING RPC get_profile_by_uid ===');
  if (profiles && profiles.length > 0) {
    for (const p of profiles) {
      if (p.uid) {
        console.log(`Testing RPC get_profile_by_uid with uid: "${p.uid}"...`);
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_profile_by_uid', { target_uid: p.uid });
        if (rpcErr) {
          console.error('RPC Error:', rpcErr);
        } else {
          console.log('RPC Success Result:', rpcData);
        }
        break;
      }
    }
  }
}

main().catch(console.error);
