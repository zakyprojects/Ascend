// Fixtures for ilikeExact: an ilike filter built from a username matches only that name
// (any case), never a wildcard pattern.
import { ilikeExact } from '../usernameRules';

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

console.log('usernameRules fixtures: all passed');
