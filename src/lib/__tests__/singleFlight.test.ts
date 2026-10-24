import { singleFlight } from '../singleFlight';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  // Calls during a run: never in parallel, and all of them together give exactly one follow-up run.
  {
    let runs = 0;
    let active = 0;
    let maxActive = 0;
    const releases: (() => void)[] = [];
    const run = singleFlight(async () => {
      runs += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });

    const first = run();
    const second = run();
    const third = run();
    assert(second === first && third === first, 'overlapping calls share the running promise');
    assert(runs === 1, 'one run started');

    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    assert(runs === 2, 'one follow-up run for both overlapping calls');
    releases.shift()!();
    await first;
    assert(runs === 2, 'no third run');
    assert(maxActive === 1, 'runs never overlap');

    // A call after the batch settled starts a fresh run.
    const later = run();
    assert(later !== first && runs === 3, 'a later call starts a new run');
    releases.shift()!();
    await later;
  }

  // A failing run releases the lock, so the next call runs again.
  {
    let runs = 0;
    const run = singleFlight(async () => {
      runs += 1;
      if (runs === 1) throw new Error('boom');
    });
    let failed = false;
    await run().catch(() => {
      failed = true;
    });
    assert(failed, 'the failure reaches the caller');
    await run();
    assert(runs === 2, 'the next call runs after a failure');
  }

  console.log('singleFlight fixtures: all passed');
}

// An assertion that throws rejects this promise; Node then exits non-zero (unhandled rejection).
void main();
