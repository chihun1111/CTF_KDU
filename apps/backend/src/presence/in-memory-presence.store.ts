import type { PresenceStore } from "./presence-heartbeat.service.js";

export class InMemoryPresenceStore implements PresenceStore {
  private readonly expiresByKey = new Map<string, number>();
  private nextPruneAt = 0;

  constructor(private readonly maxEntries = 10_000) {}

  async markSessionOnline(sessionId: string, ttlSeconds: number, now = new Date()): Promise<void> {
    const nowMs = now.getTime();
    if (nowMs >= this.nextPruneAt || this.expiresByKey.size >= this.maxEntries) this.pruneExpired(nowMs);
    const key = this.keyForSession(sessionId);
    if (!this.expiresByKey.has(key) && this.expiresByKey.size >= this.maxEntries) {
      const oldest = this.expiresByKey.keys().next().value;
      if (oldest !== undefined) this.expiresByKey.delete(oldest);
    }
    this.expiresByKey.set(key, nowMs + ttlSeconds * 1000);
  }

  activeKeys(now = new Date()): string[] {
    const nowMs = now.getTime();
    this.pruneExpired(nowMs);
    return [...this.expiresByKey.entries()]
      .filter(([, expiresAt]) => expiresAt > nowMs)
      .map(([key]) => key)
      .sort();
  }

  countActiveSessions(now = new Date()): number {
    return this.activeKeys(now).length;
  }

  private keyForSession(sessionId: string): string {
    return `presence:session:${sessionId}`;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, expiresAt] of this.expiresByKey) {
      if (expiresAt <= nowMs) this.expiresByKey.delete(key);
    }
    this.nextPruneAt = nowMs + 1_000;
  }
}
