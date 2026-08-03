import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

console.log('Testing anon profiles query...');
const start = Date.now();
const { data, error } = await supabase.from('profiles').select('id, username').ilike('username', 'testuser');
console.log('Done in', Date.now() - start, 'ms');
console.log('data:', data, 'error:', error?.message);

console.log('\nTesting authenticated profiles query...');
const email = `anon-test-${Date.now()}@test.local`;
await supabase.auth.signUp({ email, password: 'TestPassword123!' });
const start2 = Date.now();
const { data: d2, error: e2 } = await supabase.from('profiles').select('id, username').ilike('username', 'testuser');
console.log('Done in', Date.now() - start2, 'ms');
console.log('data:', d2?.length, 'error:', e2?.message);
