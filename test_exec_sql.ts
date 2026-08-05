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

async function testExecSql() {
  const sql = `
    CREATE OR REPLACE FUNCTION increment_plan_copy_count(target_plan_id uuid)
    RETURNS int
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      new_count int;
    BEGIN
      UPDATE improvement_plans
      SET copy_count = COALESCE(copy_count, 0) + 1
      WHERE id = target_plan_id
      RETURNING copy_count INTO new_count;

      RETURN COALESCE(new_count, 0);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION increment_plan_copy_count(uuid) TO authenticated, anon;
  `;

  // Try calling exec_sql if it exists
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  console.log('exec_sql error:', error);
  console.log('exec_sql data:', data);
}

testExecSql();
