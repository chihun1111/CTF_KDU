import { configureBackend, registerHttpRuntimeTests, send, startServer } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import { watch } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildFlagBackendRequest,
  buildSearchSql,
  withBoardDatabase,
  readSessionToken,
  readInternalServiceToken,
  renderBoardHome,
  renderErrorPage,
  renderSearchResults,
  searchPosts,
} from "./server.js";

const GLOBAL_HEADER_MARKUP =
  '<header class="campusGlobalHeader"> <div class="campusGlobalHeaderInner"> <a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"> <span class="campusGlobalBrandMark">KDU</span> <span class="campusGlobalBrandText">교내 CTF</span> </a> <a class="campusGlobalHomeLink" href="/">문제 목록</a> </div> </header>';

function assertGlobalHeader(html: string): void {
  const normalized = html.replace(/\s+/g, " ").trim();
  assert(normalized.includes(GLOBAL_HEADER_MARKUP));
  assert.equal((html.match(/class="campusGlobalHeader"/g) ?? []).length, 1);
  assert(html.includes("min-height: 60px;"));
  assert(html.includes("min-height: 52px;"));
  assert(html.includes("min-height: 44px;"));
  assert(html.includes(".campusGlobalBrand:focus-visible"));
}

test("challenge-07 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_07" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_07");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-07 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/07/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-07 canonicalizes the session cookie exactly once and rejects ambiguous identities", () => {
  assert.equal(readSessionToken("ctf_session=opaque-session-token; theme=dark"), "opaque-session-token");
  assert.equal(readSessionToken("theme=dark; ctf_session=%6Fpaque-session-token"), "opaque-session-token");
  for (const cookie of [undefined, "", "theme=dark", "ctf_session=", "ctf_session=%", "ctf_session=%252F", "ctf_session=bad%2Ftoken", "ctf_session=a; ctf_session=a", `ctf_session=${"a".repeat(513)}`]) {
    assert.equal(readSessionToken(cookie), null);
  }
});

test("challenge-07 intentionally interpolates the search term into the SQL statement", () => {
  const sql = buildSearchSql("' UNION SELECT id, flag, source FROM flags--");

  assert.equal(sql, "SELECT id, title, author FROM posts WHERE title LIKE '%' UNION SELECT id, flag, source FROM flags--%'");
});

test("challenge-07 board pages keep flag material out of static renders", () => {
  const home = renderBoardHome();
  const search = renderSearchResults("공지", []);
  const errorPage = renderErrorPage();

  for (const page of [home, search, errorPage]) {
    assertGlobalHeader(page);
  }
  assert(home.includes("/challenges/07/search"));
  assert(home.includes("name=\"q\""));
  assert.equal(home.includes("KDUCTF" + "{"), false);
  assert(errorPage.includes("요청을 처리하지 못했습니다."));
  assert.equal(errorPage.includes("SQL Error"), false);
});

async function configureStateDirectory(t: TestContext): Promise<string> {
  const stateRoot = await mkdtemp(join(tmpdir(), "challenge-07-state-"));
  const previousStateDirectory = process.env.STATE_DIR;
  process.env.STATE_DIR = stateRoot;
  t.after(async () => {
    if (previousStateDirectory === undefined) delete process.env.STATE_DIR;
    else process.env.STATE_DIR = previousStateDirectory;
    await rm(stateRoot, { recursive: true, force: true });
  });
  return stateRoot;
}

const flagQuery = "' UNION SELECT id, flag, source FROM flags--";
const expensiveQuery = "' UNION SELECT 1, (WITH RECURSIVE counter(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM counter) SELECT sum(n) FROM counter), 'runtime'--";
const diskSortQuery = "' UNION SELECT 1, (SELECT sum(n) FROM (WITH RECURSIVE counter(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM counter WHERE n<10000000) SELECT n FROM counter ORDER BY n DESC)), 'runtime'--";

test("challenge-07 isolates read-only puzzle data and removes it when the request finishes", { skip: process.platform === "win32" }, async (t) => {
  const stateRoot = await configureStateDirectory(t);
  const cookie = "ctf_session=board-session-cookie";
  const flag = "KDUCTF" + "{current_user_flag_07}";

  await withBoardDatabase(cookie, async (dbPath) => {
    assert.equal(dbPath.includes("board-session-cookie"), false);
    const injected = await searchPosts(dbPath, flagQuery);
    assert(injected.some((row) => row.title === flag));
    assert(injected.some((row) => row.author === "runtime"));

    await withBoardDatabase("ctf_session=other-user-cookie", async (otherDbPath) => {
      assert.notEqual(dbPath, otherDbPath);
      const otherRows = await searchPosts(otherDbPath, flagQuery);
      assert.equal(JSON.stringify(otherRows).includes(flag), false);
      assert(otherRows.some((row) => row.title === "KDUCTF" + "{other_user_flag_07}"));
    }, async () => "KDUCTF" + "{other_user_flag_07}");

    await assert.rejects(
      () => searchPosts(dbPath, "' UNION SELECT 1, readfile('/run/secrets/internal_service_token_07'), 'runtime'--"),
      /disabled|not authorized|safe mode|unsafe use|no such function/i,
    );
    await assert.rejects(() => searchPosts(dbPath, "'; DROP TABLE flags;--"), /read-only|rejected/i);
    assert((await searchPosts(dbPath, flagQuery)).some((row) => row.title === flag));
    await assert.rejects(() => searchPosts(dbPath, "a".repeat(4_097)), /size limit/);
    await assert.rejects(
      () => searchPosts(dbPath, "' UNION SELECT 1, hex(zeroblob(200000)), 'runtime'--"),
      /output limit/,
    );
    await assert.rejects(
      () => searchPosts(dbPath, "' UNION SELECT 1, length(randomblob(16000000)), 'runtime'--"),
      /rejected/,
    );
    await assert.rejects(
      () => searchPosts(dbPath, "'; PRAGMA hard_heap_limit=0; PRAGMA hard_heap_limit=1000000000; SELECT length(randomblob(16000000));--"),
      /rejected/,
    );
    await assert.rejects(() => searchPosts(dbPath, expensiveQuery), /timeout/);
    assert.equal((await searchPosts(dbPath, "")).length, 4, "expensive query failures must release the SQLite process slot");
  }, async () => flag);
  assert.deepEqual(await readdir(stateRoot), [], "completed requests must not accumulate session databases");

  assert.equal(await withBoardDatabase(cookie, async () => assert.fail("revoked session ran a query"), async () => null), null);
  assert.deepEqual(await readdir(stateRoot), []);
  await assert.rejects(() => withBoardDatabase(cookie, async () => { throw new Error("query failed"); }, async () => flag), /query failed/);
  assert.deepEqual(await readdir(stateRoot), [], "an operation failure must also remove its database");
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = stateRoot;
    await assert.rejects(() => withBoardDatabase(cookie, async () => assert.fail("initialization failed"), async () => flag), /ENOENT/);
    assert.deepEqual(await readdir(stateRoot), [], "a failed SQLite initialization must remove partial request directories");
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }

  await withBoardDatabase("ctf_session=%62oard-session-cookie; theme=dark", async (dbPath) => {
    assert((await searchPosts(dbPath, flagQuery)).some((row) => row.title === flag));
  }, async (canonicalCookie) => {
    assert.equal(canonicalCookie, cookie, "backend authorization and local identity must use the same decoded token");
    return flag;
  });
  assert.deepEqual(await readdir(stateRoot), []);
});

test("challenge-07 bounds live databases and safely cleans concurrent requests for the same session", { skip: process.platform === "win32" }, async (t) => {
  const stateRoot = await configureStateDirectory(t);
  const paths: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = Array.from({ length: 8 }, () => withBoardDatabase("ctf_session=concurrent-session", async (dbPath) => {
    paths.push(dbPath);
    await gate;
    return (await searchPosts(dbPath, flagQuery)).some((row) => row.title === "KDUCTF" + "{concurrent_flag}");
  }, async () => "KDUCTF" + "{concurrent_flag}"));
  const completion = Promise.allSettled(pending);
  try {
    const deadline = Date.now() + 2_000;
    while (paths.length < 8 && Date.now() < deadline) await delay(10);
    assert.equal(paths.length, 8);
    assert.equal(new Set(paths).size, 8, "concurrent readers must own independent temporary files");
    assert.equal((await readdir(stateRoot)).length, 8);
    await assert.rejects(
      () => withBoardDatabase("ctf_session=over-capacity", async () => assert.fail("capacity exceeded"), async () => "flag"),
      /capacity/,
    );
  } finally {
    release();
    const results = await completion;
    for (const result of results) {
      assert.equal(result.status, "fulfilled");
      if (result.status === "fulfilled") assert.equal(result.value, true);
    }
  }
  assert.deepEqual(await readdir(stateRoot), []);
  assert.equal(await withBoardDatabase("ctf_session=recovered", async (dbPath) => (await searchPosts(dbPath, "")).length, async () => "flag"), 4);
  assert.deepEqual(await readdir(stateRoot), []);
});

test("challenge-07 cancels SQLite and removes request files after an HTTP disconnect", { skip: process.platform === "win32" }, async (t) => {
  const stateRoot = await configureStateDirectory(t);
  await configureBackend(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ flagId: "FLAG-07", flag: "KDUCTF" + "{cancel_test}" })));
  const port = await startServer(t, createChallengeServer);
  assert.equal((await send(port, "/")).status, 200);
  assert.deepEqual(await readdir(stateRoot), [], "the board home page needs no database");

  const req = request({ host: "127.0.0.1", port, path: `/search?q=${encodeURIComponent(expensiveQuery)}`, headers: { cookie: "ctf_session=cancel-test" } });
  req.on("error", () => {});
  req.end();
  try {
    const deadline = Date.now() + 1_000;
    let initialized = false;
    while (!initialized && Date.now() < deadline) {
      for (const directory of await readdir(stateRoot)) {
        initialized = (await stat(join(stateRoot, directory, "board.sqlite")).catch(() => null))?.size !== undefined;
      }
      if (!initialized) await delay(10);
    }
    assert(initialized, "the real SQLite request must start before the client disconnects");
    await delay(25);
    req.destroy();
    const cleanupDeadline = Date.now() + 1_000;
    while ((await readdir(stateRoot)).length && Date.now() < cleanupDeadline) await delay(10);
    assert.deepEqual(await readdir(stateRoot), [], "client cancellation must remove files before the 2-second SQLite timeout");
  } finally {
    req.destroy();
  }
  assert.equal((await send(port, "/search")).status, 200);
  assert.deepEqual(await readdir(stateRoot), []);
});

test("challenge-07 confines real SQLite sort spill files to the request directory", { skip: process.platform !== "linux" }, async (t) => {
  const stateRoot = await configureStateDirectory(t);
  await withBoardDatabase("ctf_session=spill-test", async (dbPath) => {
    let spilled = false;
    // SQLite unlinks temporary sort files while they are still open, so observe
    // their creation rather than expecting them to survive a readdir call.
    const watcher = watch(dirname(dbPath), (_event, filename) => {
      if (filename?.toString().startsWith("etilqs_")) spilled = true;
    });
    const cancellation = new AbortController();
    const outcome = searchPosts(dbPath, diskSortQuery, cancellation.signal).then(
      () => ({ error: undefined }),
      (error: Error) => ({ error }),
    );
    try {
      const deadline = Date.now() + 1_000;
      while (!spilled && Date.now() < deadline) await delay(10);
      assert(spilled, "sort spill files must use the request directory, not an unbounded system temp directory");
      cancellation.abort();
      assert.equal((await outcome).error?.name, "AbortError");
    } finally {
      cancellation.abort();
      watcher.close();
      await outcome;
    }
  }, async () => "KDUCTF" + "{spill_test}");
  assert.deepEqual(await readdir(stateRoot), [], "the database and sort file lifetime must end with the request");
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "07" });
