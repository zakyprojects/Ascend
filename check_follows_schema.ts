import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) envVars[k.trim()] = v.trim();
});

const url = envVars.VITE_SUPABASE_URL || '';
const key = envVars.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function checkColumns() {
  const { data: authData } = await supabase.auth.signInAnonymously();
  const userId = authData.user?.id;
  console.log('Signed in as:', userId);

  // Try inserting a sample row into user_plan_follows
  const testId = '00000000-0000-0000-0000-000000000001';
  const { data, error } = await supabase.from('user_plan_follows').upsert({
    id: testId,
    user_id: userId,
    original_plan_id: '11111111-2222-3333-4444-555555555555',
    title: 'Test Follow',
    description: 'Test Desc',
    steps: [],
    is_completed: false,
    points_awarded: 0
  }).select();

  console.log('Upsert result error:', error);
  console.log('Upsert result data:', data);

  // Clean up
  await supabase.from('user_plan_follows').delete().eq('id', testId);
}

checkColumns();
