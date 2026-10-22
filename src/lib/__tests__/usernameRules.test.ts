// Fixtures for ilikeExact: an ilike filter built from a username matches only that name
// (any case), never a wildcard pattern.
import { ilikeExact, ilikeExactOrValue } from '../usernameRules';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

assert(ilikeExact('Zakria') === 'Zakria', 'plain name unchanged');
assert(ilikeExact('test_ab') === 'test\\_ab', '_ escaped');
assert(ilikeExact('a_b-c_') === 'a\\_b-c\\_', 'every _ escaped, - kept');
assert(ilikeExact('50%') === '50\\%', '% escaped');
assert(ilikeExact('a\\b') === 'a\\\\b', 'backslash escaped');
assert(ilikeExact('') === '', 'empty');

// ilikeExactOrValue: quoted for PostgREST .or(); PostgREST drops one backslash per \\ or \" inside
// the quotes (checked against the live API 2026-10-22: "qwe\\_" no longer matches qwer, "qw\\er" does).
assert(ilikeExactOrValue('Zakria') === '"Zakria"', 'plain name quoted');
assert(ilikeExactOrValue('test_ab') === '"test\\\\_ab"', 'LIKE escape doubled inside quotes');
assert(ilikeExactOrValue('a,b.(c)') === '"a,b.(c)"', 'or() signs kept inside quotes');
assert(ilikeExactOrValue('a"b') === '"a\\"b"', 'double quote escaped');
assert(ilikeExactOrValue('a\\b') === '"a\\\\\\\\b"', 'backslash: LIKE escape, then quote escape');

console.log('usernameRules fixtures: all passed');
