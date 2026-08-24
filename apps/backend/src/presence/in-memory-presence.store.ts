import type { PresenceStore } from "./presence-heartbeat.service.js";

export class InMemoryPresenceStore implements PresenceStore {
  private readonly expiresByKey = new Map<string, number>();

  async markSessionOnline(sessionId: string, ttlSeconds: number, now = new Date()): Promise<void> {
    this.expiresByKey.set(this.keyForSession(sessionId), now.getTime() + ttlSeconds * 1000);
  }

  activeKeys(now = new Date()): string[] {
    const nowMs = now.getTime();
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
}
