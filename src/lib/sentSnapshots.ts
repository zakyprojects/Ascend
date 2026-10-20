/**
 * What this tab last wrote to the server, per account and target, as JSON. A save whose content
 * is byte-identical to the last successful one has nothing to send, so it can be skipped. Memory
 * only: a reload starts empty and sign-in/sign-out clear it, so the first save always writes.
 * A false "changed" (same data, different key order) only costs one write; a change is never
 * hidden, because the state holds plain JSON values only.
 */
export class SentSnapshots {
  private readonly sent = new Map<string, string>();

  private static key(userId: string, target: string) {
    return `${userId}\u0000${target}`;
  }

  matches(userId: string, target: string, snapshot: string): boolean {
    return this.sent.get(SentSnapshots.key(userId, target)) === snapshot;
  }

  /** Call only after the write succeeded. */
  remember(userId: string, target: string, snapshot: string): void {
    this.sent.set(SentSnapshots.key(userId, target), snapshot);
  }

  /** One account's snapshots, or every account's when no id is given. */
  forget(userId?: string): void {
    if (userId === undefined) {
      this.sent.clear();
      return;
    }
    const prefix = `${userId}\u0000`;
    for (const key of [...this.sent.keys()]) {
      if (key.startsWith(prefix)) this.sent.delete(key);
    }
  }
}

export function snapshotOf(value: unknown): string {
  return JSON.stringify(value ?? null);
}
