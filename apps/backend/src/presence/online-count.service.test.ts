import assert from "node:assert/strict";
import test from "node:test";
import { OnlineCountService } from "./online-count.service.js";

test("OnlineCountService returns Redis presence count when Redis has active session keys", async () => {
  const service = new OnlineCountService(
    {
      async countActiveSessions() {
        return 3;
      },
    },
    {
      async countRecentlySeenSessions() {
        throw new Error("DB fallback should not be used");
      },
    },
  );

  assert.deepEqual(await service.getOnlineCount(new Date("2026-05-10T00:00:00.000Z")), {
    onlineSessionCount: 3,
    source: "redis_presence",
    windowSeconds: 90,
    generatedAt: "2026-05-10T00:00:00.000Z",
  });
});

test("an unconfigured Redis uses the database without reporting a healthy Redis source", async () => {
  const service = new OnlineCountService(null, { countRecentlySeenSessions: async () => 4 });
  const result = await service.getOnlineCount();
  assert.equal(result.onlineSessionCount, 4);
  assert.equal(result.source, "db_last_seen_fallback");
});

test("a rejected Redis scan falls back to database activity", async () => {
  const service = new OnlineCountService({ countActiveSessions: async () => { throw new Error("scan aborted"); } }, {
    countRecentlySeenSessions: async () => 7,
  });
  assert.equal((await service.getOnlineCount()).onlineSessionCount, 7);
});

test("OnlineCountService falls back to last_seen_at window when Redis is unavailable or empty", async () => {
  const events: string[] = [];
  const service = new OnlineCountService(
    {
      async countActiveSessions() {
        events.push("redis-count");
        return 0;
      },
    },
    {
      async countRecentlySeenSessions(since, now) {
        events.push(`db-count:${since.toISOString()}:${now.toISOString()}`);
        return 2;
      },
    },
  );

  assert.deepEqual(await service.getOnlineCount(new Date("2026-05-10T00:02:00.000Z")), {
    onlineSessionCount: 2,
    source: "db_last_seen_fallback",
    windowSeconds: 120,
    generatedAt: "2026-05-10T00:02:00.000Z",
  });
  assert.deepEqual(events, ["redis-count", "db-count:2026-05-10T00:00:00.000Z:2026-05-10T00:02:00.000Z"]);
});
