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
const client = createClient(url, key);

async function inspectPlanQewr() {
  console.log('======================================================================');
  console.log('         RAW LIVE DATABASE QUERY FOR REAL MILESTONE PLAN "qewr"       ');
  console.log('======================================================================\n');

  const { data: plans, error } = await client
    .from('improvement_plans')
    .select('*')
    .ilike('title', '%qewr%');

  if (error || !plans || plans.length === 0) {
    console.error('Plan "qewr" not found by title ilike. Querying all recent plans...');
    const { data: allPlans } = await client.from('improvement_plans').select('*');
    allPlans?.forEach((p) => {
      console.log(`Plan ID: ${p.id}, Title: "${p.title}", Creator Username: ${p.creator_username}`);
      console.log(`Raw steps.items:`, JSON.stringify(p.steps?.items, null, 2));
    });
    return;
  }

  plans.forEach((p) => {
    console.log(`PLAN ID: ${p.id}`);
    console.log(`Title: "${p.title}"`);
    console.log(`Creator ID: ${p.creator_id}`);
    console.log(`Creator Username: ${p.creator_username}`);
    console.log(`RAW DB steps.items ARRAY:`);
    console.log(JSON.stringify(p.steps?.items, null, 2));
  });
}

inspectPlanQewr().catch(console.error);
