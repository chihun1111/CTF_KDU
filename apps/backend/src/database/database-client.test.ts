import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createDatabaseClient, DATABASE_POOL_LIMITS } from "./database-client.js";

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
  assert.deepEqual(poolOptions, [{ connectionString: "postgres://user:pass@postgres:5432/campus_ctf", ...DATABASE_POOL_LIMITS }]);
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

function transactionHarness(onQuery?: (text: string) => void | Promise<void>) {
  const queries: string[] = [];
  const releases: boolean[] = [];
  const connections: TransactionConnection[] = [];
  class TransactionConnection extends EventEmitter {
    async query(query: string | { text: string }) {
      const text = typeof query === "string" ? query : query.text;
      queries.push(text);
      await onQuery?.(text);
      return { rows: [], fields: [], rowCount: 0, command: "", oid: 0 };
    }
    release(discard?: boolean) { releases.push(discard ?? false); }
  }
  class TransactionTestPool extends EventEmitter {
    constructor() { super(); }
    async connect() {
      const connection = new TransactionConnection();
      connections.push(connection);
      return connection;
    }
  }
  const client = createDatabaseClient("postgres://example", {
    PoolCtor: TransactionTestPool,
    // Exercise the installed Drizzle implementation, including its BEGIN and
    // savepoint lifecycle. Only the PostgreSQL wire connection is simulated.
    drizzleFactory: (connection, options) => drizzle(connection as unknown as PoolClient, options),
  });
  return { client, queries, releases, connections };
}

test("real Drizzle transactions discard and release a connection when BEGIN rejects", async () => {
  const harness = transactionHarness((text) => {
    if (text === "begin") throw new Error("Query read timeout");
  });
  let entered = false;
  await assert.rejects(harness.client.db.transaction(async () => { entered = true; }), (error: unknown) => {
    assert(error instanceof Error && error.cause instanceof Error);
    assert.equal(error.cause.message, "Query read timeout");
    return true;
  });
  assert.equal(entered, false);
  assert.deepEqual(harness.queries, ["begin"]);
  assert.equal(harness.connections.length, 1);
  assert.deepEqual(harness.releases, [true]);
  assert.equal(harness.connections[0]!.listenerCount("error"), 0);
});

test("real Drizzle transactions preserve configuration and nested savepoints on one connection", async () => {
  const harness = transactionHarness();
  const result = await harness.client.db.transaction(async (transaction) => {
    await transaction.execute(sql`select 1`);
    await transaction.transaction(async (nested) => { await nested.execute(sql`select 2`); });
    return "committed";
  }, { isolationLevel: "serializable", accessMode: "read only", deferrable: true });
  assert.equal(result, "committed");
  assert.deepEqual(harness.queries, [
    "begin isolation level serializable read only deferrable", "select 1",
    "savepoint sp1", "select 2", "release savepoint sp1", "commit",
  ]);
  assert.equal(harness.connections.length, 1);
  assert.deepEqual(harness.releases, [false]);
  assert.equal(harness.connections[0]!.listenerCount("error"), 0);
});

test("checked-out connection errors are handled and failed rollback still discards the connection", async () => {
  const harness = transactionHarness((text) => {
    if (text === "rollback") throw new Error("Connection lost");
  });
  await assert.rejects(harness.client.db.transaction(async () => {
    assert.doesNotThrow(() => harness.connections[0]!.emit("error", new Error("Socket closed")));
    throw new Error("Transaction failed");
  }), /rollback/);
  assert.deepEqual(harness.queries, ["begin", "rollback"]);
  assert.deepEqual(harness.releases, [true]);
  assert.equal(harness.connections[0]!.listenerCount("error"), 0);
});

test("concurrent shutdown calls wait for the same pool close", async () => {
  let completeClose!: () => void;
  let closeCalls = 0;
  const closing = new Promise<void>((resolve) => { completeClose = resolve; });
  class FakePool {
    end() { closeCalls += 1; return closing; }
  }
  const client = createDatabaseClient("postgres://example", { PoolCtor: FakePool, drizzleFactory: () => ({}) });
  const first = client.onModuleDestroy();
  const second = client.onModuleDestroy();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(closeCalls, 1);
  completeClose();
  await Promise.all([first, second]);
  assert.equal(client.onModuleDestroy(), first);
});
