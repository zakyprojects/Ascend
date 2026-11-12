// Hook test (real useAppState + in-process fake Supabase, see harness/): an account whose profile
// row has no uid yet (made before the uid column) gets one written back at sign-in.
//   T33  when that write fails on the server, the app still loads and the failure is logged
//        (supabase-js returns the error in { error } instead of throwing it).
import { bootHook, story, until, assert, pass, fake, server, UID } from './harness/bootHook';

await story('profileUidBackfill.hook (uid backfill error is seen)', async () => {
  const row = server.g('profiles').find((p: { id: string }) => p.id === UID);
  row.uid = null;
  fake.fail('profiles', 500, ['PATCH']);

  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    warn(...args);
  };

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded although the backfill failed');
  await until(() => warnings.some((w) => w.includes('Profile UID backfill skipped')), 'T33: the failed backfill is logged');
  assert(!row.uid, 'T33: the failed write left the row unchanged');
  pass('T33 a failed uid backfill is logged and does not stop the load');
});
