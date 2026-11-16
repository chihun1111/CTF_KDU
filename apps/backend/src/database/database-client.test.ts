import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseClient } from "./database-client.js";

test("createDatabaseClient creates a pg pool from the database URL and passes it to Drizzle", () => {
  const poolOptions: unknown[] = [];
  const pools: unknown[] = [];

  class FakePool {
    constructor(options: unknown) {
      poolOptions.push(options);
      pools.push(this);
    }
  }

  const drizzleCalls: unknown[] = [];
  const fakeDb = { query: "db" };
  const drizzleFactory = (pool: unknown, options: unknown) => {
    drizzleCalls.push({ pool, options });
    return fakeDb;
  };

  const result = createDatabaseClient("postgres://user:pass@postgres:5432/campus_ctf", {
    PoolCtor: FakePool,
    drizzleFactory,
  });

  assert.equal(result.db, fakeDb);
  assert.equal(result.pool, pools[0]);
  assert.deepEqual(poolOptions, [{ connectionString: "postgres://user:pass@postgres:5432/campus_ctf" }]);
  assert.deepEqual(drizzleCalls, [{ pool: pools[0], options: { casing: "snake_case" } }]);
});

test("database clients close their pool once during application shutdown", async () => {
  const events: string[] = [];
  class FakePool {
    on(event: string) { events.push(`listen:${event}`); }
    async end() { events.push("end"); }
  }
  const client = createDatabaseClient("postgres://example", { PoolCtor: FakePool, drizzleFactory: () => ({}) });
  await client.onModuleDestroy();
  await client.onModuleDestroy();
  assert.deepEqual(events, ["listen:error", "end"]);
});
