import assert from "node:assert/strict";
import test from "node:test";
import { RedisPresenceStore } from "./redis-presence.store.js";

test("RedisPresenceStore writes the documented Redis TTL key without sensitive values", async () => {
  const events: string[] = [];
  const redis = {
    async setEx(key: string, seconds: number, value: string) {
      events.push(`setEx:${key}:${seconds}:${value}`);
    },
    async ping() { return "PONG"; },
    async scan(cursor: string, options: { MATCH: string; COUNT: number }) {
      events.push(`scan:${cursor}:${options.MATCH}`);
      return { cursor: "0", keys: ["presence:session:session-1", "presence:session:session-2"] };
    },
  };
  const store = new RedisPresenceStore(redis);

  await store.markSessionOnline("session-1", 90);
  const activeCount = await store.countActiveSessions();

  assert.deepEqual(events, ["setEx:presence:session:session-1:90:1", "scan:0:presence:session:*"]);
  assert.equal(activeCount, 2);
  assert.equal(JSON.stringify(events).includes("user-1"), false);
  assert.equal(JSON.stringify(events).includes("opaque-token"), false);
});

test("presence scans follow empty pages, deduplicate Redis SCAN replies, and coalesce callers", async () => {
  const calls: string[] = [];
  const store = new RedisPresenceStore({
    setEx: async () => undefined,
    ping: async () => "PONG",
    async scan(cursor) {
      calls.push(cursor);
      if (cursor === "0") return { cursor: "1", keys: ["presence:session:a"] };
      if (cursor === "1") return { cursor: "2", keys: [] };
      return { cursor: "0", keys: ["presence:session:a", "presence:session:b"] };
    },
  });
  assert.deepEqual(await Promise.all([store.countActiveSessions(), store.countActiveSessions()]), [2, 2]);
  assert.deepEqual(calls, ["0", "1", "2"]);
});

test("an endless presence cursor rejects instead of returning an incomplete count", async () => {
  const store = new RedisPresenceStore({
    setEx: async () => undefined,
    ping: async () => "PONG",
    scan: async () => ({ cursor: "1", keys: [] }),
  });
  await assert.rejects(store.countActiveSessions(), /budget/);
});
