import { pathForView, viewFromLegacyHash, viewFromLocation, viewFromPath } from '../routes';
import { VIEWS } from '../views';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function runFixtures() {
  for (const view of VIEWS) {
    assert(viewFromPath(pathForView(view)) === view, `${view} round-trips through its path`);
  }
  assert(pathForView('dashboard') === '/', 'dashboard is /');
  assert(pathForView('prefrontal') === '/prefrontal-cortex', 'PFC lives at /prefrontal-cortex');

  assert(viewFromPath('/habits/') === 'habits', 'trailing slash');
  assert(viewFromPath('/Habits') === 'habits', 'case');
  assert(viewFromPath('/books') === 'reading', 'alias /books');
  assert(viewFromPath('/prefrontal') === 'prefrontal', 'alias /prefrontal');
  assert(viewFromPath('/index.html') === 'dashboard', '/index.html');
  assert(viewFromPath('/foo') === null, 'unknown path');
  assert(viewFromPath('/%E0%A4%A') === null, 'malformed escape');

  assert(viewFromLegacyHash('#/habits') === 'habits', 'old #/habits');
  assert(viewFromLegacyHash('#/books') === 'reading', 'old #/books');
  assert(viewFromLegacyHash('#/nope') === 'dashboard', 'old unknown route');
  assert(viewFromLegacyHash('#access_token=x&type=signup') === null, 'auth token hash is not a route');
  assert(viewFromLegacyHash('#error=access_denied') === null, 'auth error hash is not a route');
  assert(viewFromLegacyHash('') === null, 'bare # / no hash');

  assert(viewFromLocation({ pathname: '/journal', hash: '#access_token=x' }) === 'journal', 'path wins over token hash');
  assert(viewFromLocation({ pathname: '/', hash: '#/leagues' }) === 'leagues', 'old hash wins on /');

  console.log('\nAll routes fixture assertions PASSED successfully!');
}

runFixtures();
