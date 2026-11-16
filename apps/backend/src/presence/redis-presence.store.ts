import type { PresenceStore } from "./presence-heartbeat.service.js";

export type RedisPresenceClient = {
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  ping(): Promise<unknown>;
  scan(cursor: string, options: { MATCH: string; COUNT: number }, abortSignal?: AbortSignal): Promise<{ cursor: string; keys: string[] }>;
  onModuleDestroy?(): void;
};

export class RedisPresenceStore implements PresenceStore {
  private pendingCount: Promise<number> | undefined;

  constructor(private readonly redis: RedisPresenceClient) {}

  async markSessionOnline(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.setEx(`presence:session:${sessionId}`, ttlSeconds, "1");
  }

  countActiveSessions(): Promise<number> {
    // Coalesce simultaneous dashboard refreshes; never issue blocking KEYS.
    this.pendingCount ??= this.scanActiveSessions().finally(() => { this.pendingCount = undefined; });
    return this.pendingCount;
  }

  private async scanActiveSessions(): Promise<number> {
    const seen = new Set<string>();
    const signal = AbortSignal.timeout(1_500);
    let cursor = "0";
    for (let page = 0; page < 250; page += 1) {
      signal.throwIfAborted();
      const result = await this.redis.scan(cursor, { MATCH: "presence:session:*", COUNT: 200 }, signal);
      for (const key of result.keys) seen.add(key);
      if (seen.size > 50_000) throw new Error("Presence scan capacity exceeded");
      cursor = result.cursor;
      if (cursor === "0") return seen.size;
    }
    // A partial scan is not a valid count. Let OnlineCountService use the DB.
    throw new Error("Presence scan did not complete within its budget");
  }
}
