import {
  authPathWithNext,
  authRouteFromPath,
  nextFromSearch,
  pathForAuthRoute,
  pathForView,
  safeNextPath,
  viewFromLegacyHash,
  viewFromLocation,
  viewFromPath,
} from '../routes';
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

  // Sign-in pages
  assert(pathForAuthRoute('login') === '/login' && pathForAuthRoute('signup') === '/signup', 'auth paths');
  assert(authRouteFromPath('/login') === 'login', '/login');
  assert(authRouteFromPath('/signup/') === 'signup', '/signup/ trailing slash');
  assert(authRouteFromPath('/Login') === 'login', 'case');
  assert(authRouteFromPath('/habits') === null, 'a page is not a sign-in page');
  assert(authRouteFromPath('/login/extra') === null, 'nested path is not a sign-in page');
  assert(viewFromPath('/login') === null, '/login is not a page');

  // next: only same-site paths
  assert(safeNextPath('/habits') === '/habits', 'plain path');
  assert(safeNextPath('/prefrontal-cortex?tab=live') === '/prefrontal-cortex?tab=live', 'query kept');
  assert(safeNextPath('/habits#x') === '/habits', 'hash dropped');
  assert(safeNextPath('/') === '/', 'root');
  assert(safeNextPath(null) === '/' && safeNextPath(undefined) === '/' && safeNextPath('') === '/', 'missing');
  assert(safeNextPath('https://evil.com') === '/', 'absolute URL');
  assert(safeNextPath('//evil.com') === '/', 'protocol-relative');
  assert(safeNextPath('///evil.com') === '/', 'triple slash');
  assert(safeNextPath('/\\evil.com') === '/', 'slash backslash');
  assert(safeNextPath('\\evil.com') === '/', 'backslashes');
  assert(safeNextPath('/\t/evil.com') === '/', 'tab trick');
  assert(safeNextPath('/\n/evil.com') === '/', 'newline trick');
  assert(safeNextPath(' /habits') === '/', 'leading space');
  assert(safeNextPath('javascript:alert(1)') === '/', 'javascript scheme');
  assert(safeNextPath('habits') === '/', 'relative path');
  assert(safeNextPath('/login') === '/' && safeNextPath('/signup?next=%2Fhabits') === '/', 'no loop through a sign-in page');
  assert(nextFromSearch('?next=%2Fhabits') === '/habits', 'next from query');
  assert(nextFromSearch('?next=%2Fprefrontal-cortex%3Ftab%3Dlive') === '/prefrontal-cortex?tab=live', 'encoded query in next');
  assert(nextFromSearch('?next=https%3A%2F%2Fevil.com') === '/', 'encoded absolute URL rejected');
  assert(nextFromSearch('?next=%2F%2Fevil.com') === '/', 'encoded // rejected');
  assert(nextFromSearch('') === '/', 'no query');
  assert(authPathWithNext('login', '/habits') === '/login?next=%2Fhabits', 'login with next');
  assert(authPathWithNext('login', '/') === '/login', 'dashboard needs no next');
  assert(authPathWithNext('signup', '//evil.com') === '/signup', 'unsafe next dropped');
  assert(
    authPathWithNext('login', '/prefrontal-cortex?tab=live') === '/login?next=%2Fprefrontal-cortex%3Ftab%3Dlive',
    'next keeps the query'
  );

  console.log('\nAll routes fixture assertions PASSED successfully!');
}

runFixtures();
