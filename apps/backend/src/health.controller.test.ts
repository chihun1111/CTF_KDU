import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "./health.controller.js";

test("HealthController keeps /health as a simple backend liveness response", () => {
  const controller = new HealthController(null, null);

  assert.deepEqual(controller.health(), {
    status: "ok",
    service: "backend",
  });
});

test("HealthController apiHealth reports backend, postgres, and redis dependency state", async () => {
  const controller = new HealthController(
    {
      db: {
        async execute() { return { rows: [{ "?column?": 1 }] }; },
      },
    },
    {
      async ping() { return "PONG"; },
      async scan() { throw new Error("health must not scan keys"); },
      async setEx() {
        throw new Error("not used");
      },
    },
  );

  const health = await controller.apiHealth(new Date("2026-05-10T00:00:00.000Z"));

  assert.equal(health.backend.status, "ok");
  assert.equal(health.backend.checkedAt, "2026-05-10T00:00:00.000Z");
  assert.equal(health.postgres.status, "ok");
  assert.equal(health.redis.status, "ok");
  assert.equal(health.postgres.latencyMs >= 0, true);
  assert.equal(health.redis.latencyMs >= 0, true);
});

test("HealthController apiHealth marks missing or failing dependencies without exposing internals", async () => {
  const controller = new HealthController(
    {
      db: {
        async execute() { throw new Error("password=secret"); },
      },
    },
    null,
  );

  const health = await controller.apiHealth(new Date("2026-05-10T00:00:00.000Z"));
  const serialized = JSON.stringify(health);

  assert.equal(health.postgres.status, "down");
  assert.equal(health.redis.status, "degraded");
  assert.equal(serialized.includes("password=secret"), false);
});

test("health calls share probes and bound hung dependencies without delaying healthy latency", { timeout: 5_000 }, async () => {
  let postgresCalls = 0;
  let redisCalls = 0;
  const controller = new HealthController({ db: {
    execute: async () => { postgresCalls += 1; return new Promise(() => undefined); },
  } }, {
    ping: async () => { redisCalls += 1; return "PONG"; },
    scan: async () => { throw new Error("not used"); },
    setEx: async () => { throw new Error("not used"); },
  });
  const start = Date.now();
  const [first, second] = await Promise.all([controller.apiHealth(), controller.apiHealth()]);
  assert.equal(first.postgres.status, "down");
  assert.equal(second.redis.status, "ok");
  assert(first.redis.latencyMs < first.postgres.latencyMs);
  assert(Date.now() - start < 3_000);
  await controller.apiHealth();
  assert.equal(postgresCalls, 1);
  assert.equal(redisCalls, 1);
});
