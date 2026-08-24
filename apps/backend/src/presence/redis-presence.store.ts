import type { PresenceStore } from "./presence-heartbeat.service.js";

export type RedisPresenceClient = {
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
};

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: RedisPresenceClient) {}

  async markSessionOnline(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.setEx(`presence:session:${sessionId}`, ttlSeconds, "1");
  }

  async countActiveSessions(): Promise<number> {
    return (await this.redis.keys("presence:session:*")).length;
  }
}
