import { registerHttpRuntimeTests } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildFlagBackendRequest,
  buildInstancePath,
  buildSearchSql,
  ensureBoardDatabase,
  readInternalServiceToken,
  renderBoardHome,
  renderErrorPage,
  renderSearchResults,
  searchPosts,
} from "./server.js";

const GLOBAL_HEADER_MARKUP =
  '<header class="campusGlobalHeader"> <div class="campusGlobalHeaderInner"> <a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"> <span class="campusGlobalBrandMark">KDU</span> <span class="campusGlobalBrandText">교내 서비스</span> </a> <a class="campusGlobalHomeLink" href="/hub">전체 서비스</a> </div> </header>';

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

test("challenge-07 maps a cookie to a non-identifying SQLite path", () => {
  const path = buildInstancePath("ctf_session=opaque-session-token", join(tmpdir(), "challenge-07"));
  const pathWithUnrelatedCookie = buildInstancePath(
    "ctf_session=opaque-session-token; theme=dark",
    join(tmpdir(), "challenge-07"),
  );

  assert(path.endsWith(".sqlite"));
  assert.equal(path.includes("opaque-session-token"), false);
  assert.equal(pathWithUnrelatedCookie, path);
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
  assert(home.includes("/community/board/search"));
  assert(home.includes("name=\"q\""));
  assert.equal(home.includes("KDUCTF" + "{"), false);
  assert(errorPage.includes("요청을 처리하지 못했습니다."));
  assert.equal(errorPage.includes("SQL Error"), false);
});

test("challenge-07 seeds the session database with only the current user's flag", { skip: process.platform === "win32" }, async (t) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "challenge-07-state-"));
  const previousStateDirectory = process.env.STATE_DIR;
  process.env.STATE_DIR = stateRoot;
  t.after(async () => {
    if (previousStateDirectory === undefined) delete process.env.STATE_DIR;
    else process.env.STATE_DIR = previousStateDirectory;
    await rm(stateRoot, { recursive: true, force: true });
  });

  const cookie = "ctf_session=board-session-cookie";
  const flag = "KDUCTF" + "{current_user_flag_07}";

  const dbPath = await ensureBoardDatabase(cookie, async () => flag);
  assert(dbPath);

  const injected = await searchPosts(dbPath, "' UNION SELECT id, flag, source FROM flags--");
  assert(injected.some((row) => String(row.title) === flag));
  assert(injected.some((row) => String(row.author) === "runtime"));

  const otherDbPath = await ensureBoardDatabase("ctf_session=other-user-cookie", async () => "KDUCTF" + "{other_user_flag_07}");
  assert(otherDbPath);
  assert.notEqual(dbPath, otherDbPath);

  const otherRows = await searchPosts(otherDbPath, "' UNION SELECT id, flag, source FROM flags--");
  assert.equal(JSON.stringify(otherRows).includes(flag), false);

  await assert.rejects(
    () => searchPosts(dbPath, "' UNION SELECT 1, readfile('/run/secrets/internal_service_token_07'), 'runtime'--"),
    /disabled|not authorized|safe mode|unsafe use|no such function/i,
  );

  assert.equal(await ensureBoardDatabase(cookie, async () => null), null,
    "an existing database must not authorize a revoked or expired session");

  await assert.rejects(() => searchPosts(dbPath, "'; DROP TABLE flags;--"), /read-only|rejected/i);
  const preserved = await searchPosts(dbPath, "' UNION SELECT id, flag, source FROM flags--");
  assert(preserved.some((row) => row.title === flag), "write attempts must leave the intended puzzle solvable");

  const concurrentPaths = await Promise.all(Array.from({ length: 12 }, () =>
    ensureBoardDatabase("ctf_session=concurrent-first-visit", async () => "KDUCTF" + "{concurrent_flag_07}"),
  ));
  assert(concurrentPaths.every((path) => path === concurrentPaths[0]));
  assert(concurrentPaths[0]);
  const concurrentRows = await searchPosts(concurrentPaths[0], "' UNION SELECT id, flag, source FROM flags--");
  assert.equal(concurrentRows.filter((row) => row.title === "KDUCTF" + "{concurrent_flag_07}").length, 1);
  assert((await readdir(stateRoot)).every((name) => name.endsWith(".sqlite")), "initialization must leave no partial files");

  await assert.rejects(() => searchPosts(dbPath, "a".repeat(4_097)), /size limit/);
  await assert.rejects(
    () => searchPosts(dbPath, "' UNION SELECT 1, hex(zeroblob(200000)), 'runtime'--"),
    /output limit/,
  );
  await assert.rejects(
    () => searchPosts(dbPath, "' UNION SELECT 1, (WITH RECURSIVE counter(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM counter) SELECT sum(n) FROM counter), 'runtime'--"),
    /timeout/,
  );
  assert.equal((await searchPosts(dbPath, "")).length, 4, "the service must recover after rejected expensive queries");
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "07" });
