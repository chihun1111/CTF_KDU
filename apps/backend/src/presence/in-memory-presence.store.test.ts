import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPresenceStore } from "./in-memory-presence.store.js";

test("InMemoryPresenceStore uses documented presence key shape without user or token data", async () => {
  const store = new InMemoryPresenceStore();
  const now = new Date("2026-05-10T00:00:00.000Z");

  await store.markSessionOnline("session-1", 90, now);
  await store.markSessionOnline("session-2", 30, now);

  assert.deepEqual(store.activeKeys(new Date("2026-05-10T00:00:20.000Z")), [
    "presence:session:session-1",
    "presence:session:session-2",
  ]);
  assert.equal(store.countActiveSessions(new Date("2026-05-10T00:00:20.000Z")), 2);
  assert.deepEqual(store.activeKeys(new Date("2026-05-10T00:01:00.000Z")), ["presence:session:session-1"]);
  assert.equal(store.countActiveSessions(new Date("2026-05-10T00:01:00.000Z")), 1);
  assert.deepEqual(store.activeKeys(new Date("2026-05-10T00:02:00.000Z")), []);
  assert.equal(store.activeKeys(now).some((key) => key.includes("user-1")), false);
  assert.equal(store.activeKeys(now).some((key) => key.includes("opaque-token")), false);
});
