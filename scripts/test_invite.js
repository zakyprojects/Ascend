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

async function main() {
  console.log('=== 1. QUERYING PARTNER_INVITES TABLE ===');
  const { data: invites, error: invErr } = await supabase
    .from('partner_invites')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (invErr) {
    console.error('Error fetching partner_invites:', invErr);
  } else {
    console.log(`Fetched ${invites ? invites.length : 0} partner_invites rows:`);
    console.log(JSON.stringify(invites, null, 2));
  }

  console.log('\n=== 2. QUERYING PARTNERSHIPS TABLE ===');
  const { data: partnerships, error: partErr } = await supabase
    .from('partnerships')
    .select('*')
    .limit(10);

  if (partErr) {
    console.error('Error fetching partnerships:', partErr);
  } else {
    console.log(`Fetched ${partnerships ? partnerships.length : 0} partnerships rows:`);
    console.log(JSON.stringify(partnerships, null, 2));
  }
}

main().catch(console.error);
