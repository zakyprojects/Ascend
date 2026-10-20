// keepIfUnchanged: the 60 s reconcile tick in store.ts (checkUpdates) returns the same state when
// nothing changed, so the autosave does not fire.
import { keepIfUnchanged } from '../stateEquality';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

type S = { goals: { id: string; done: boolean }[]; pacts: { id: string; streak: number }[]; name?: string };

const prev: S = { goals: [{ id: 'g1', done: false }], pacts: [{ id: 'p1', streak: 3 }], name: 'a' };

// Rebuilt with equal contents (new arrays/objects, as the reconcilers do): prev itself.
{
  const next: S = { ...prev, goals: prev.goals.map((g) => ({ ...g })), pacts: prev.pacts.map((p) => ({ ...p })) };
  assert(keepIfUnchanged(prev, next) === prev, 'equal rebuild returns prev');
}

// Same reference: prev.
assert(keepIfUnchanged(prev, prev) === prev, 'same object returns prev');

// A nested change: next.
{
  const next: S = { ...prev, pacts: [{ id: 'p1', streak: 4 }] };
  assert(keepIfUnchanged(prev, next) === next, 'changed streak returns next');
}
{
  const next: S = { ...prev, goals: [{ id: 'g1', done: true }] };
  assert(keepIfUnchanged(prev, next) === next, 'changed goal returns next');
}

// Added or removed keys: next.
{
  const next = { ...prev, extra: 1 } as S;
  assert(keepIfUnchanged(prev, next) === next, 'added key returns next');
}
{
  const { name: _drop, ...rest } = prev;
  const next = { ...rest, other: 'x' } as unknown as S;
  assert(keepIfUnchanged(prev, next) === next, 'renamed key returns next');
}

// undefined vs missing-in-JSON values compare equal to null only at top level of a key.
{
  const a = { v: undefined as number | undefined };
  const b = { v: undefined as number | undefined };
  assert(keepIfUnchanged(a, b) === a, 'undefined values equal');
}

console.log('stateEquality fixtures passed');
