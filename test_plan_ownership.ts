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

async function checkPlanOwnership(targetPlanId?: string) {
  console.log('=== PLAN OWNERSHIP & RLS DIAGNOSTIC ===\n');

  // 1. Get all plans currently in DB
  const { data: plans, error: fetchErr } = await supabase
    .from('improvement_plans')
    .select('id, title, creator_id, creator_username, is_public, copy_count, created_at');

  if (fetchErr) {
    console.error('DB Fetch Error:', fetchErr.message);
    return;
  }

  console.log(`Total plans found in database: ${plans?.length || 0}`);

  if (plans && plans.length > 0) {
    plans.forEach((p, idx) => {
      console.log(`\n--- Plan #${idx + 1} ---`);
      console.log(`Plan ID: ${p.id}`);
      console.log(`Title: ${p.title}`);
      console.log(`Creator Username: ${p.creator_username}`);
      console.log(`Creator ID (DB): ${p.creator_id}`);
      console.log(`Is Public: ${p.is_public}`);
      console.log(`Copy Count: ${p.copy_count}`);
      console.log(`Created At: ${p.created_at}`);
    });
  }

  if (targetPlanId) {
    console.log(`\n=== SPECIFIC PLAN DIAGNOSTIC FOR ID: ${targetPlanId} ===`);
    const { data: singlePlan, error: singleErr } = await supabase
      .from('improvement_plans')
      .select('id, title, creator_id, creator_username, is_public, copy_count')
      .eq('id', targetPlanId)
      .maybeSingle();

    if (singleErr) {
      console.error('Single Plan Fetch Error:', singleErr.message);
    } else if (singlePlan) {
      console.log(`Plan ID: ${singlePlan.id}`);
      console.log(`Title: ${singlePlan.title}`);
      console.log(`Is Public: ${singlePlan.is_public}`);
      console.log(`Creator Username: ${singlePlan.creator_username}`);
      console.log(`Creator ID (DB): ${singlePlan.creator_id}`);
    } else {
      console.log(`No plan found with ID: ${targetPlanId}`);
    }
  }

  console.log('\n=======================================');
}

// Pass plan ID if available, or leave empty to list all plans
const args = process.argv.slice(2);
checkPlanOwnership(args[0]);
