/**
 * Reproduces the Supabase auth deadlock when onAuthStateChange awaits client calls.
 * Run: node scripts/test-auth-deadlock.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const testEmail = `deadlock-test-${Date.now()}@test.local`;
const testPassword = 'TestPassword123!';

async function testWithBlockingCallback() {
  console.log('\n--- Test 1: BLOCKING onAuthStateChange (async await in callback) ---');
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

  client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      console.log('[callback] SIGNED_IN - awaiting user_data fetch...');
      await client.from('user_data').select('state').eq('user_id', session.user.id).maybeSingle();
      console.log('[callback] fetch done');
    }
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT after 8s - DEADLOCK CONFIRMED')), 8000)
  );

  try {
    await Promise.race([
      client.auth.signUp({ email: testEmail, password: testPassword }),
      timeout,
    ]);
    console.log('signUp completed (no deadlock)');
  } catch (e) {
    console.log('Result:', e.message);
  }
}

async function testWithDeferredCallback() {
  console.log('\n--- Test 2: DEFERRED onAuthStateChange (setTimeout 0) ---');
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const email2 = `deferred-test-${Date.now()}@test.local`;

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      setTimeout(async () => {
        console.log('[deferred callback] SIGNED_IN - awaiting user_data fetch...');
        await client.from('user_data').select('state').eq('user_id', session.user.id).maybeSingle();
        console.log('[deferred callback] fetch done');
      }, 0);
    }
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT after 8s')), 8000)
  );

  try {
    const { data, error } = await Promise.race([
      client.auth.signUp({ email: email2, password: testPassword }),
      timeout,
    ]);
    if (error) console.log('signUp error:', error.message);
    else console.log('signUp completed! user:', data?.user?.id?.slice(0, 8));
  } catch (e) {
    console.log('Result:', e.message);
  }
}

await testWithBlockingCallback();
await testWithDeferredCallback();
