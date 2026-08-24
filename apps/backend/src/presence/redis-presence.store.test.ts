import assert from "node:assert/strict";
import test from "node:test";
import { RedisPresenceStore } from "./redis-presence.store.js";

test("RedisPresenceStore writes the documented Redis TTL key without sensitive values", async () => {
  const events: string[] = [];
  const redis = {
    async setEx(key: string, seconds: number, value: string) {
      events.push(`setEx:${key}:${seconds}:${value}`);
    },
    async keys(pattern: string) {
      events.push(`keys:${pattern}`);
      return ["presence:session:session-1", "presence:session:session-2"];
    },
  };
  const store = new RedisPresenceStore(redis);

  await store.markSessionOnline("session-1", 90);
  const activeCount = await store.countActiveSessions();

  assert.deepEqual(events, ["setEx:presence:session:session-1:90:1", "keys:presence:session:*"]);
  assert.equal(activeCount, 2);
  assert.equal(JSON.stringify(events).includes("user-1"), false);
  assert.equal(JSON.stringify(events).includes("opaque-token"), false);
});
