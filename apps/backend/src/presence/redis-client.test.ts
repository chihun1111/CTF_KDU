import assert from "node:assert/strict";
import test from "node:test";
import { attachRedisPresenceErrorHandler, createRedisClientFromEnv } from "./redis-client.js";

test("createRedisClientFromEnv connects only when REDIS_URL is configured", async () => {
  const events: string[] = [];
  const client = {
    setEx: async () => undefined,
    keys: async () => [],
  };
  const factory = async (url: string) => {
    events.push(`connect:${url}`);
    return client;
  };

  assert.equal(await createRedisClientFromEnv({}, factory), null);
  assert.equal(await createRedisClientFromEnv({ REDIS_URL: "   " }, factory), null);
  assert.equal(await createRedisClientFromEnv({ REDIS_URL: "redis://redis:6379" }, factory), client);
  assert.deepEqual(events, ["connect:redis://redis:6379"]);
});

test("attachRedisPresenceErrorHandler registers an error listener for socket failures", () => {
  const events: string[] = [];

  attachRedisPresenceErrorHandler({
    on(event, listener) {
      events.push(event);
      listener(new Error("Socket closed unexpectedly"));
    },
  });

  assert.deepEqual(events, ["error"]);
});
