/**
 * Wraps an async task so calls never overlap: a call while a run is in progress asks for one more
 * run after it (any number of such calls ask for just one) and gets the promise of the running
 * batch, which settles once that follow-up has finished too.
 */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await task();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  };
}
