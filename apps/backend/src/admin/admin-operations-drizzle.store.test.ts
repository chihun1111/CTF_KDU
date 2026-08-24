import assert from "node:assert/strict";
import test from "node:test";
import { AdminOperationsDrizzleStore } from "./admin-operations-drizzle.store.js";

function makeQuery(rows: unknown[]) {
  const query = {
    from() {
      return query;
    },
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    limit() {
      return query;
    },
    offset() {
      return Promise.resolve(rows);
    },
    then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return query;
}

test("AdminOperationsDrizzleStore returns pseudonymous participant references without decrypting student ids", async () => {
  const selectedRows = [
    [
      {
        userId: "user-1",
        role: "participant",
        registeredAt: new Date("2026-05-10T00:00:00.000Z"),
      },
    ],
    [{ count: 1 }],
    [],
    [],
    [],
    [],
  ];
  const selectCalls: unknown[] = [];
  const store = new AdminOperationsDrizzleStore(
    {
      db: {
        select(selection?: unknown) {
          selectCalls.push(selection);
          return makeQuery(selectedRows.shift() ?? []);
        },
      },
    },
  );

  const participants = await store.listParticipants({
    page: 1,
    pageSize: 50,
    now: new Date("2026-05-10T00:02:00.000Z"),
  });

  const serialized = JSON.stringify(participants);
  assert.match(participants.items[0]?.participantRef ?? "", /^participant:[0-9a-f]{12}$/);
  assert.equal(serialized.includes("2622022"), false);
  assert.equal(serialized.includes("user-1"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(selectCalls[0] as object, "studentIdCiphertext"), false);
});
