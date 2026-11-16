const REDIS_PRESENCE_WINDOW_SECONDS = 90;
const DB_FALLBACK_WINDOW_SECONDS = 120;

export type OnlineCountSource = "redis_presence" | "db_last_seen_fallback";

export type OnlineCountResult = {
  onlineSessionCount: number;
  source: OnlineCountSource;
  windowSeconds: number;
  generatedAt: string;
};

export type OnlineCountPresenceStore = {
  countActiveSessions(): Promise<number>;
};

export type OnlineCountFallbackStore = {
  countRecentlySeenSessions(since: Date, now: Date): Promise<number>;
};

export class OnlineCountService {
  constructor(
    private readonly presenceStore: OnlineCountPresenceStore | null,
    private readonly fallbackStore: OnlineCountFallbackStore,
  ) {}

  async getOnlineCount(now = new Date()): Promise<OnlineCountResult> {
    try {
      const redisCount = await this.presenceStore?.countActiveSessions() ?? 0;
      if (redisCount > 0) {
        return {
          onlineSessionCount: redisCount,
          source: "redis_presence",
          windowSeconds: REDIS_PRESENCE_WINDOW_SECONDS,
          generatedAt: now.toISOString(),
        };
      }
    } catch {
      // Redis is a live presence cache; DB last_seen_at remains the authoritative fallback.
    }

    const since = new Date(now.getTime() - DB_FALLBACK_WINDOW_SECONDS * 1000);
    return {
      onlineSessionCount: await this.fallbackStore.countRecentlySeenSessions(since, now),
      source: "db_last_seen_fallback",
      windowSeconds: DB_FALLBACK_WINDOW_SECONDS,
      generatedAt: now.toISOString(),
    };
  }
}
