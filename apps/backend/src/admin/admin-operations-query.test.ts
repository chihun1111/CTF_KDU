import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { AdminOperationsDrizzleStore } from "./admin-operations-drizzle.store.js";

/** Execute the portable SELECT SQL emitted by the real PostgreSQL Drizzle adapter.
 * SQLite supplies data-driven regression coverage without adding a test dependency;
 * the Docker runtime workflow separately checks the production PostgreSQL adapter.
 */
function database(t: TestContext) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, created_at TEXT);
    CREATE TABLE final_submissions (id TEXT PRIMARY KEY, user_id TEXT, correct_count INTEGER, is_clear INTEGER, created_at TEXT);
    CREATE TABLE final_submission_results (id TEXT PRIMARY KEY, final_submission_id TEXT, user_id TEXT, flag_id TEXT, is_correct INTEGER);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, last_seen_at TEXT, expires_at TEXT, revoked_at TEXT);
    CREATE TABLE clears (id TEXT PRIMARY KEY, user_id TEXT, cleared_at TEXT);
    CREATE TABLE challenges (id TEXT PRIMARY KEY, flag_id TEXT, title TEXT, is_active INTEGER);
  `);
  const queries: Array<{ sql: string; rowCount: number }> = [];
  const client = {
    async query(config: { text: string; rowMode?: string }, values: unknown[] = []) {
      const bindings: SQLInputValue[] = [];
      const text = config.text.replace(/\$(\d+)/g, (_match, position: string) => {
        const value = values[Number(position) - 1];
        bindings.push(value instanceof Date ? value.toISOString() : typeof value === "boolean" ? Number(value) : value as SQLInputValue);
        return "?";
      });
      const statement = sqlite.prepare(text);
      if (config.rowMode === "array") statement.setReturnArrays(true);
      const columns = statement.columns();
      const rows = statement.all(...bindings).map((row) => {
        if (!Array.isArray(row)) return row;
        // node-postgres decodes SQL boolean columns before Drizzle maps rows.
        return row.map((value: unknown, index: number) =>
          value !== null && ["is_clear", "is_correct", "is_active"].includes(columns[index]?.column ?? "") ? Boolean(value) : value);
      });
      queries.push({ sql: config.text, rowCount: rows.length });
      return { rows };
    },
  };
  return { sqlite, queries, store: new AdminOperationsDrizzleStore({ db: drizzle(client as unknown as Pool) }) };
}

const now = new Date("2026-05-10T00:10:00.000Z");
function reference(id: string) { return `participant:${createHash("sha256").update(id).digest("hex").slice(0, 12)}`; }

test("participant metrics stay accurate beyond the former global 1000/5000-row cutoffs", async (t) => {
  const { sqlite, store } = database(t);
  sqlite.exec(`
    INSERT INTO users VALUES ('quiet', 'participant', '2026-05-01T00:00:00.000Z'), ('busy', 'participant', '2026-05-02T00:00:00.000Z');
    INSERT INTO final_submissions VALUES ('quiet-result', 'quiet', 7, 0, '2026-05-09T00:00:00.000Z');
    INSERT INTO sessions VALUES ('quiet-session', 'quiet', '2026-05-10T00:09:20.000Z', '2026-05-11T00:00:00.000Z', NULL);
    BEGIN;
  `);
  const submission = sqlite.prepare("INSERT INTO final_submissions VALUES (?, 'busy', 3, 0, '2026-05-10T00:00:00.000Z')");
  const session = sqlite.prepare("INSERT INTO sessions VALUES (?, 'busy', '2026-05-10T00:09:50.000Z', '2026-05-11T00:00:00.000Z', NULL)");
  for (let index = 0; index < 5_101; index += 1) {
    submission.run(`busy-${index}`);
    session.run(`busy-session-${index}`);
  }
  sqlite.exec("COMMIT");

  const page = await store.listParticipants({ page: 1, pageSize: 20, now });
  const quiet = page.items.find((item) => item.participantRef === reference("quiet"));
  const busy = page.items.find((item) => item.participantRef === reference("busy"));
  assert.equal(quiet?.latestCorrectCount, 7);
  assert.equal(quiet?.online, true);
  assert.equal(quiet?.finalSubmissionCount, 1);
  assert.equal(busy?.finalSubmissionCount, 5_101);
  assert.equal(page.totalCount, 2);
});

test("multiple active sessions report the most recent activity and exclude expired or revoked sessions", async (t) => {
  const { sqlite, store } = database(t);
  sqlite.exec(`
    INSERT INTO users VALUES ('participant', 'participant', '2026-05-01T00:00:00.000Z');
    INSERT INTO sessions VALUES
      ('older', 'participant', '2026-05-10T00:08:30.000Z', '2026-05-11T00:00:00.000Z', NULL),
      ('latest', 'participant', '2026-05-10T00:09:40.000Z', '2026-05-11T00:00:00.000Z', NULL),
      ('revoked', 'participant', '2026-05-10T00:09:50.000Z', '2026-05-11T00:00:00.000Z', '2026-05-10T00:09:51.000Z'),
      ('expired', 'participant', '2026-05-10T00:09:59.000Z', '2026-05-10T00:10:00.000Z', NULL);
  `);
  const page = await store.listParticipants({ page: 1, pageSize: 20, now });
  assert.equal(page.items[0]?.lastSeenAt?.toISOString(), "2026-05-10T00:09:40.000Z");
  assert.equal(page.items[0]?.online, true);
});

test("challenge solve totals count every distinct participant and exclude operator rehearsal results", async (t) => {
  const { sqlite, store } = database(t);
  sqlite.exec(`
    INSERT INTO users VALUES ('busy', 'participant', '2026-05-01'), ('quiet', 'participant', '2026-05-01'), ('operator', 'admin', '2026-05-01');
    INSERT INTO challenges VALUES ('challenge-01', 'FLAG-01', 'Example', 1);
    BEGIN;
  `);
  const correct = sqlite.prepare("INSERT INTO final_submission_results VALUES (?, ?, 'busy', 'FLAG-01', 1)");
  for (let index = 0; index < 5_101; index += 1) correct.run(`result-${index}`, `submission-${index}`);
  sqlite.exec(`
    INSERT INTO final_submission_results VALUES ('quiet-result', 'quiet-submission', 'quiet', 'FLAG-01', 1);
    INSERT INTO final_submission_results VALUES ('operator-result', 'operator-submission', 'operator', 'FLAG-01', 1);
    COMMIT;
  `);
  const status = await store.listChallengeStatus(now);
  assert.equal(status.find((item) => item.flagId === "FLAG-01")?.solvedCount, 2);
  assert.equal(status.find((item) => item.flagId === "FLAG-02")?.visible, false);
});

test("summary metrics exclude operator test submissions and clears consistently", async (t) => {
  const { sqlite, store } = database(t);
  sqlite.exec(`
    INSERT INTO users VALUES ('participant', 'participant', '2026-05-01'), ('operator', 'admin', '2026-05-01');
    INSERT INTO final_submissions VALUES ('participant-submission', 'participant', 8, 1, '2026-05-10'), ('operator-submission', 'operator', 8, 1, '2026-05-10');
    INSERT INTO clears VALUES ('participant-clear', 'participant', '2026-05-10'), ('operator-clear', 'operator', '2026-05-10');
  `);
  assert.deepEqual(await store.getSummaryCounts(), {
    registeredUserCount: 1, submittedUserCount: 1, clearedUserCount: 1, finalSubmissionCount: 1,
  });
  const submissions = await store.listSubmissions({ page: 1, pageSize: 20 });
  assert.equal(submissions.totalCount, 1);
  assert.deepEqual(submissions.items.map((item) => item.id), ["participant-submission"]);
  const clears = await store.listClears({ page: 1, pageSize: 20 });
  assert.equal(clears.totalCount, 1);
  assert.deepEqual(clears.items.map((item) => item.participantRef), [reference("participant")]);
});

test("submission pagination only loads result rows belonging to the displayed page", async (t) => {
  const { sqlite, queries, store } = database(t);
  sqlite.exec("INSERT INTO users VALUES ('participant', 'participant', '2026-05-01T00:00:00.000Z'); BEGIN;");
  const submission = sqlite.prepare("INSERT INTO final_submissions VALUES (?, 'participant', 1, 0, ?)");
  const result = sqlite.prepare("INSERT INTO final_submission_results VALUES (?, ?, 'participant', 'FLAG-01', 1)");
  for (let index = 0; index < 60; index += 1) {
    const id = `submission-${String(index).padStart(2, "0")}`;
    submission.run(id, new Date(now.getTime() + index * 1000).toISOString());
    result.run(`result-${index}`, id);
  }
  sqlite.exec("COMMIT");
  const page = await store.listSubmissions({ page: 2, pageSize: 20 });
  assert.equal(page.items.length, 20);
  assert.equal(page.totalCount, 60);
  assert.equal(page.items[0]?.id, "submission-39");
  assert.equal(page.items.at(-1)?.id, "submission-20");
  assert.ok(page.items.every((item) => item.resultsByFlagId["FLAG-01"]?.correct));
  const resultQuery = queries.find((entry) => entry.sql.includes('from "final_submission_results"'));
  assert.equal(resultQuery?.rowCount, 20);
});
