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

async function testDatabaseState() {
  console.log('=== 1. Inspecting current partner_invites in DB ===');
  const { data: invites, error: invErr } = await supabase.from('partner_invites').select('*');
  console.log('Invites Count:', invites?.length, 'Err:', invErr);
  if (invites && invites.length > 0) {
    console.log('Sample Invite:', invites[0]);
  }

  console.log('\n=== 2. Inspecting current partnerships in DB ===');
  const { data: partnerships, error: partErr } = await supabase.from('partnerships').select('*');
  console.log('Partnerships Count:', partnerships?.length, 'Err:', partErr);
  if (partnerships && partnerships.length > 0) {
    console.log('Sample Partnerships:', partnerships);
  }

  console.log('\n=== 3. Testing DELETE on partner_invites with anon client ===');
  if (invites && invites.length > 0) {
    const testId = invites[0].id;
    const { error: delErr } = await supabase.from('partner_invites').delete().eq('id', testId);
    console.log('Delete Invite Result Error:', delErr);
  }

  console.log('\n=== 4. Testing DELETE on partnerships with anon client ===');
  if (partnerships && partnerships.length > 0) {
    const testId = partnerships[0].id;
    const { error: delPartErr } = await supabase.from('partnerships').delete().eq('id', testId);
    console.log('Delete Partnership Result Error:', delPartErr);
  }
}

testDatabaseState().catch(console.error);
