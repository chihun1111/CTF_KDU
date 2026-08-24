import assert from "node:assert/strict";
import test from "node:test";
import { ChallengesDrizzleStore } from "./challenges-drizzle.store.js";

type QueryCall = {
  selection?: unknown;
  table?: unknown;
  where?: unknown;
  orderBy?: unknown[];
  limit?: number;
};

function createDatabase(rows: {
  activeChallenges: unknown[];
  latestSubmission: unknown[];
  submissionResults: unknown[];
  challengeDetail?: unknown[];
}): { database: { db: { select: (selection?: unknown) => unknown } }; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  let challengeSelectionCount = 0;

  function resolveRows(call: QueryCall): unknown[] {
    const selectionKeys = Object.keys((call.selection ?? {}) as Record<string, unknown>);
    if (selectionKeys.includes("isCorrect")) {
      return rows.submissionResults;
    }
    if (selectionKeys.includes("correctCount")) {
      return rows.latestSubmission;
    }
    challengeSelectionCount += 1;
    if (rows.challengeDetail && (challengeSelectionCount > 1 || rows.activeChallenges.length === 0)) {
      return rows.challengeDetail;
    }
    return rows.activeChallenges;
  }

  return {
    calls,
    database: {
      db: {
        select(selection?: unknown) {
          const call: QueryCall = { selection };
          calls.push(call);
          return {
            from(table: unknown) {
              call.table = table;
              return {
                where(condition: unknown) {
                  call.where = condition;
                  return {
                    orderBy(...columns: unknown[]) {
                      call.orderBy = columns;
                      return {
                        limit(count: number) {
                          call.limit = count;
                          return Promise.resolve(resolveRows(call));
                        },
                      };
                    },
                    limit(count: number) {
                      call.limit = count;
                      return Promise.resolve(resolveRows(call));
                    },
                  };
                },
              };
            },
          };
        },
      },
    },
  };
}

test("ChallengesDrizzleStore lists active public challenge fields only", async () => {
  const { database, calls } = createDatabase({
    activeChallenges: [
      {
        flagId: "FLAG-01",
      },
    ],
    latestSubmission: [],
    submissionResults: [],
    challengeDetail: [],
  });
  const store = new ChallengesDrizzleStore(database as ConstructorParameters<typeof ChallengesDrizzleStore>[0]);

  const rows = await store.listActiveChallenges();

  assert.deepEqual(rows, [
    {
      flagId: "FLAG-01",
    },
  ]);
  assert.equal(calls[0]?.limit, 8);
  assert.equal(JSON.stringify(rows).includes("KDUCTF" + "{"), false);
});

test("ChallengesDrizzleStore returns latest final-submit progress without submitted values", async () => {
  const { database } = createDatabase({
    activeChallenges: [],
    latestSubmission: [
      {
        id: "submission-1",
        correctCount: 2,
        isClear: false,
      },
    ],
    submissionResults: [
      { flagId: "FLAG-01", isCorrect: true },
      { flagId: "FLAG-02", isCorrect: false },
    ],
    challengeDetail: [],
  });
  const store = new ChallengesDrizzleStore(database as ConstructorParameters<typeof ChallengesDrizzleStore>[0]);

  const progress = await store.getLatestProgress("user-1");

  assert.deepEqual(progress, {
    correctCount: 2,
    requiredCount: 8,
    cleared: false,
    resultsByFlagId: {
      "FLAG-01": { correct: true },
      "FLAG-02": { correct: false },
    },
  });
  assert.equal(JSON.stringify(progress).includes("user-1"), false);
  assert.equal(JSON.stringify(progress).includes("submission-1"), false);
  assert.equal(JSON.stringify(progress).includes("submitted"), false);
});

test("ChallengesDrizzleStore returns empty progress before the first final submit", async () => {
  const { database } = createDatabase({
    activeChallenges: [],
    latestSubmission: [],
    submissionResults: [],
    challengeDetail: [],
  });
  const store = new ChallengesDrizzleStore(database as ConstructorParameters<typeof ChallengesDrizzleStore>[0]);

  assert.deepEqual(await store.getLatestProgress("user-1"), {
    correctCount: 0,
    requiredCount: 8,
    cleared: false,
    resultsByFlagId: {},
  });
});
