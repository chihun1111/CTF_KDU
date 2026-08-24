import assert from "node:assert/strict";
import test from "node:test";
import { PresenceHeartbeatService, type PresenceStore } from "./presence-heartbeat.service.js";

function createStore(events: string[]): PresenceStore {
  return {
    async markSessionOnline(sessionId, ttlSeconds) {
      events.push(`mark:${sessionId}:${ttlSeconds}`);
    },
  };
}

test("PresenceHeartbeatService stores a TTL marker by internal session id only", async () => {
  const events: string[] = [];
  const service = new PresenceHeartbeatService(createStore(events));

  const result = await service.heartbeat({
    sessionId: "session-1",
    userId: "user-1",
    role: "participant",
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, ["mark:session-1:90"]);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(events).includes("opaque-token"), false);
});
