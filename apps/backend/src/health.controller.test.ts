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
        select() {
          return {
            async from() {
              return [{ count: 0 }];
            },
          };
        },
      },
    },
    {
      async keys(pattern: string) {
        assert.equal(pattern, "__healthcheck__");
        return [];
      },
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
        select() {
          return {
            async from() {
              throw new Error("password=secret");
            },
          };
        },
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
