import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const serviceId = "service-07";
const serviceName = "자유게시판";
const unitName = "학생처";
const challengeId = "07";
const defaultStateRoot = "/app/state";

const SERVICE_PAGE_STYLE = `
      :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-muted: #f4f3f8; --text: #1a1c1f; --muted: #515f74; --border: #e2e8f0; --accent: #003366; --accent-strong: #001e40; --success: #166534; --warning: #92400e; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: "Pretendard", "Noto Sans KR", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; }
      .campusGlobalHeader {
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        color: #001e40;
      }
      .campusGlobalHeaderInner {
        display: flex;
        width: min(1120px, calc(100% - 32px));
        min-height: 60px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin: 0 auto;
      }
      .campusGlobalBrand {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        gap: 10px;
        color: inherit;
        text-decoration: none;
      }
      .campusGlobalBrandMark {
        display: grid;
        width: 42px;
        height: 28px;
        place-items: center;
        border-radius: 6px;
        background: #003366;
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 900;
        letter-spacing: 0.08em;
      }
      .campusGlobalBrandText {
        font-weight: 850;
      }
      .campusGlobalHomeLink {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        border: 1px solid #c3c6d1;
        border-radius: 4px;
        background: #ffffff;
        padding: 0 14px;
        color: #003366;
        font-size: 0.88rem;
        font-weight: 800;
        text-decoration: none;
      }
      .campusGlobalBrand:focus-visible,
      .campusGlobalHomeLink:focus-visible {
        outline: 3px solid rgb(0 51 102 / 0.2);
        outline-offset: 2px;
      }
      .campusGlobalHomeLink:hover {
        background: #f4f3f8;
      }
      @media (max-width: 640px) {
        .campusGlobalHeaderInner {
          min-height: 52px;
        }
        .campusGlobalBrandText {
          display: none;
        }
        .campusGlobalHomeLink {
          min-height: 44px;
          padding: 0 12px;
        }
      }
      .serviceShell { width: min(1280px, calc(100% - 48px)); margin: 0 auto; padding: 40px 0; }
      .serviceHeader, .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 22px; margin-bottom: 16px; }
      .unit { margin: 0 0 8px; color: var(--accent); font-size: .82rem; font-weight: 800; text-transform: uppercase; }
      h1 { margin: 0; color: var(--accent-strong); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; letter-spacing: -.02em; }
      h2 { margin-top: 0; }
      p { color: var(--muted); line-height: 1.6; }
      form.search { display: flex; gap: 8px; margin-top: 12px; }
      form.search input[name="q"] { flex: 1; min-height: 44px; border: 1px solid var(--border); border-radius: 4px; padding: 9px 12px; font-size: .95rem; }
      form.search input[name="q"]:focus { border-color: var(--accent); outline: 3px solid rgb(0 51 102 / .16); }
      form.search button { border: 1px solid var(--accent); background: var(--accent); color: #ffffff; border-radius: 4px; padding: 9px 18px; font-weight: 800; cursor: pointer; }
      .list { display: grid; gap: 10px; padding: 0; list-style: none; margin: 14px 0 0; }
      .list li { border-top: 1px solid var(--border); padding-top: 12px; }
      .list a { color: var(--accent); font-weight: 750; text-decoration: none; }
      .meta { color: var(--muted); font-size: .86rem; }
      table.results { width: 100%; border-collapse: collapse; margin-top: 12px; }
      table.results th, table.results td { text-align: left; padding: 12px 10px; border-top: 1px solid var(--border); font-size: .95rem; word-break: break-all; }
      table.results th { color: var(--muted); font-size: .78rem; letter-spacing: .05em; }
      table.results tbody tr:nth-child(even) { background: var(--surface-muted); }
      .errorBox { border: 1px solid #d8b4b4; background: #fdf3f3; color: #7c2d2d; border-radius: 8px; padding: 16px; }
      .boardSummary { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
      .boardSummary p { margin: 0; }
      .boardTable { width: 100%; border-collapse: collapse; margin-top: 14px; }
      .boardTable th, .boardTable td { text-align: left; padding: 14px 10px; border-top: 1px solid var(--border); }
      .boardTable th { color: var(--muted); font-size: .78rem; letter-spacing: .05em; }
      .boardTable tbody tr:nth-child(even) { background: var(--surface-muted); }
      .boardTable a { color: var(--accent-strong); font-weight: 750; text-decoration: none; }
      .noticeBadge { display: inline-flex; border-radius: 4px; background: #d5e3ff; padding: 3px 8px; color: var(--accent); font-size: .74rem; font-weight: 800; }
      @media (max-width: 640px) { .serviceShell { width: min(100% - 32px, 1280px); } form.search { display: grid; } .panel { overflow-x: auto; } .boardTable, table.results { min-width: 640px; } }
`;

class UpstreamUnavailableError extends Error {}
class BoardCapacityError extends Error {}

type Env = Record<string, string | undefined>;
type SecretFileReader = (path: string) => Promise<string | Buffer>;
type FlagResponse = {
  flagId?: unknown;
  flag?: unknown;
};
type CurrentFlagFetcher = (cookieHeader: string | undefined, signal?: AbortSignal) => Promise<string | null>;

export async function readInternalServiceToken(
  env: Env = process.env,
  readSecretFile: SecretFileReader = readFile,
): Promise<string | null> {
  const tokenFile = env.INTERNAL_SERVICE_TOKEN_FILE?.trim();
  if (!tokenFile) {
    return null;
  }

  try {
    const value = await readSecretFile(tokenFile);
    const token = value.toString().trim();
    return token ? token : null;
  } catch {
    return null;
  }
}

export function buildFlagBackendRequest(input: {
  backendInternalUrl: string | undefined;
  cookieHeader: string | undefined;
  serviceToken: string;
}): { url: string; headers: Record<string, string> } {
  const backendUrl = input.backendInternalUrl?.trim() || "http://backend:8080";
  const url = new URL(`/internal/challenges/${challengeId}/flag`, backendUrl);
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.serviceToken}`,
  };
  if (input.cookieHeader) {
    headers.cookie = input.cookieHeader;
  }

  return { url: url.toString(), headers };
}

/** Match backend cookie decoding before using a session token as a local identity. */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader || cookieHeader.length > 16_384) return null;
  let token: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== "ctf_session") continue;
    if (token !== null) return null;
    const encoded = part.slice(separator + 1).trim();
    if (!encoded || encoded.length > 512) return null;
    try {
      const decoded = decodeURIComponent(encoded);
      if (!/^[A-Za-z0-9_-]+$/.test(decoded)) return null;
      token = decoded;
    } catch {
      return null;
    }
  }
  return token;
}

async function fetchCurrentUserFlag(cookieHeader: string | undefined, signal?: AbortSignal): Promise<string | null> {
  if (!readSessionToken(cookieHeader)) return null;
  const serviceToken = await readInternalServiceToken();
  if (!serviceToken) throw new UpstreamUnavailableError("Service authentication is unavailable");

  try {
    const backendRequest = buildFlagBackendRequest({
      backendInternalUrl: process.env.BACKEND_INTERNAL_URL,
      cookieHeader,
      serviceToken,
    });
    const response = await fetch(backendRequest.url, {
      headers: backendRequest.headers,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) return null;
      throw new UpstreamUnavailableError("Flag service is unavailable");
    }
    const body = (await response.json()) as FlagResponse;
    if (body?.flagId !== "FLAG-07" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

export function buildSearchSql(queryExpression: string): string {
  return `SELECT id, title, author FROM posts WHERE title LIKE '%${queryExpression}%'`;
}

const SQLITE_TIMEOUT_MS = 2_000;
const SQLITE_MAX_OUTPUT_BYTES = 256 * 1024;
const SQLITE_MAX_HEAP_BYTES = 8 * 1024 * 1024;
const SQLITE_MAX_CONCURRENT = 8;
let activeSqliteProcesses = 0;

async function runSqlite(dbPath: string, statements: string[], readOnly = false, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (activeSqliteProcesses >= SQLITE_MAX_CONCURRENT) {
    throw new BoardCapacityError("SQLite concurrency limit reached");
  }
  activeSqliteProcesses += 1;
  try {
    return await new Promise<string>((resolveOutput, reject) => {
      // The intentional SQL injection is limited to reading this session's database.
      // SQL goes in an argument, not stdin, so sqlite3 dot commands cannot run.
      // Unlike soft_heap_limit, this limit cannot be raised again by injected SQL.
      const sql = [`PRAGMA hard_heap_limit=${SQLITE_MAX_HEAP_BYTES};`, ...statements].join("\n");
      const args = ["-safe", "-batch", "-json", ...(readOnly ? ["-readonly"] : []), dbPath, sql];
      const child = spawn("sqlite3", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, SQLITE_TMPDIR: dirname(dbPath) },
        ...(signal ? { signal } : {}),
        killSignal: "SIGKILL",
      });
      const stdout: Buffer[] = [];
      let outputBytes = 0;
      let failure: Error | undefined;
      const stop = (message: string) => {
        failure ??= new Error(message);
        child.kill("SIGKILL");
      };
      const timeout = setTimeout(() => stop("SQLite execution timeout exceeded"), SQLITE_TIMEOUT_MS);
      timeout.unref();
      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > SQLITE_MAX_OUTPUT_BYTES) {
          stop("SQLite output limit exceeded");
        } else if (!failure) {
          stdout.push(chunk);
        }
      });
      // Errors can contain SQL, flags, or file paths. Do not retain or return them.
      child.stderr.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > SQLITE_MAX_OUTPUT_BYTES) stop("SQLite output limit exceeded");
      });
      child.on("error", (error) => { failure = error; });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error("SQLite query rejected in read-only safe mode"));
        else {
          const output = Buffer.concat(stdout).toString("utf8");
          const firstLineEnd = output.indexOf("\n");
          try {
            const configuration = JSON.parse(output.slice(0, firstLineEnd));
            if (configuration[0]?.hard_heap_limit !== SQLITE_MAX_HEAP_BYTES) throw new Error("Invalid heap limit");
            resolveOutput(output.slice(firstLineEnd + 1));
          } catch {
            reject(new Error("SQLite memory limit could not be verified"));
          }
        }
      });
    });
  } finally {
    activeSqliteProcesses -= 1;
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function initializeBoardDatabase(dbPath: string, flag: string, signal?: AbortSignal): Promise<void> {
  await runSqlite(dbPath, [
    "BEGIN;",
    "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, author TEXT NOT NULL);",
    "CREATE TABLE flags (id INTEGER PRIMARY KEY, flag TEXT NOT NULL, source TEXT NOT NULL);",
    "INSERT INTO posts (id, title, content, author) VALUES (1, '중간고사 일정 안내', '중간고사 기간에는 상담 운영이 축소됩니다.', '교무과');",
    "INSERT INTO posts (id, title, content, author) VALUES (2, '교내 미니 축제 참가 안내', '부스 신청은 학생처 홈페이지에서 받습니다.', '축제기획단');",
    "INSERT INTO posts (id, title, content, author) VALUES (3, '프로그래밍 과제 안내', '제출 양식과 마감 일정을 확인하세요.', '컴퓨터공학과');",
    "INSERT INTO posts (id, title, content, author) VALUES (4, '도서관 운영 시간 변경 안내', '시험 기간 동안 야간 개방 시간이 연장됩니다.', '도서관');",
    `INSERT INTO flags (id, flag, source) VALUES (1, ${sqlString(flag)}, 'runtime');`,
    "COMMIT;",
  ], false, signal);
}

let activeBoardRequests = 0;

/** All board data is regenerated read-only puzzle data, scoped to this request. */
export async function withBoardDatabase<T>(
  cookieHeader: string | undefined,
  operation: (dbPath: string) => Promise<T>,
  fetchCurrentFlag: CurrentFlagFetcher = fetchCurrentUserFlag,
  signal?: AbortSignal,
): Promise<T | null> {
  signal?.throwIfAborted();
  const sessionToken = readSessionToken(cookieHeader);
  if (!sessionToken) return null;
  const flag = await fetchCurrentFlag(`ctf_session=${sessionToken}`, signal);
  if (!flag) return null;
  signal?.throwIfAborted();
  if (activeBoardRequests >= SQLITE_MAX_CONCURRENT) {
    throw new BoardCapacityError("Board request capacity exceeded");
  }

  activeBoardRequests += 1;
  let directory: string | undefined;
  try {
    const stateRoot = process.env.STATE_DIR?.trim() || defaultStateRoot;
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    directory = await mkdtemp(join(stateRoot, "request-"));
    const dbPath = join(directory, "board.sqlite");
    await initializeBoardDatabase(dbPath, flag, signal);
    signal?.throwIfAborted();
    return await operation(dbPath);
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      activeBoardRequests -= 1;
    }
  }
}

export async function searchPosts(dbPath: string, queryExpression: string, signal?: AbortSignal): Promise<Array<Record<string, unknown>>> {
  if (Buffer.byteLength(queryExpression, "utf8") > 4_096) {
    throw new Error("Search query exceeds the size limit");
  }
  const output = await runSqlite(dbPath, [buildSearchSql(queryExpression)], true, signal);
  return output.trim() ? (JSON.parse(output) as Array<Record<string, unknown>>) : [];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell(title: string, bodyContent: string): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | ${serviceName}</title>
    <style>${SERVICE_PAGE_STYLE}</style>
  </head>
  <body>
    <header class="campusGlobalHeader">
      <div class="campusGlobalHeaderInner">
        <a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기">
          <span class="campusGlobalBrandMark">KDU</span>
          <span class="campusGlobalBrandText">교내 서비스</span>
        </a>
        <a class="campusGlobalHomeLink" href="/hub">전체 서비스</a>
      </div>
    </header>
    <main class="serviceShell">${bodyContent}</main>
  </body>
</html>`;
}

export function renderBoardHome(): string {
  return renderShell(
    serviceName,
    `
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>${serviceName}</h1>
        <p>교내 자유게시판입니다. 제목으로 게시글을 검색할 수 있습니다.</p>
        <form class="search" action="/community/board/search" method="get">
          <input type="text" name="q" placeholder="게시글 제목을 입력하세요" aria-label="검색어" />
          <button type="submit">검색</button>
        </form>
      </header>
      <section class="panel" aria-label="최근 게시글">
        <div class="boardSummary"><div><h2>최근 게시글</h2><p>학생처에서 제공하는 교내 공지와 자유 글입니다.</p></div><span class="meta">총 3건</span></div>
        <table class="boardTable">
          <thead><tr><th>구분</th><th>제목</th><th>작성 부서</th><th>등록일</th><th>조회</th></tr></thead>
          <tbody>
            <tr><td><span class="noticeBadge">공지</span></td><td><a href="/community/board/search?q=%EC%A4%91%EA%B0%84%EA%B3%A0%EC%82%AC">중간고사 일정 안내</a></td><td>교무과</td><td>2026. 8. 21.</td><td>184</td></tr>
            <tr><td><span class="noticeBadge">안내</span></td><td><a href="/community/board/search?q=%EC%B6%95%EC%A0%9C">교내 미니 축제 참가 안내</a></td><td>축제기획단</td><td>2026. 8. 19.</td><td>327</td></tr>
            <tr><td>일반</td><td><a href="/community/board/search?q=%EA%B3%BC%EC%A0%9C">프로그래밍 과제 안내</a></td><td>컴퓨터공학과</td><td>2026. 8. 17.</td><td>96</td></tr>
          </tbody>
        </table>
      </section>
    `,
  );
}

export function renderSearchResults(query: string, rows: Array<Record<string, unknown>>): string {
  const resultRows = rows.length
    ? rows
        .map(
          (row) =>
            `<tr><td>#${escapeHtml(row.id)}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.author)}</td></tr>`,
        )
        .join("\n")
    : "<tr><td colspan=\"3\">검색 결과가 없습니다.</td></tr>";

  return renderShell(
    `${serviceName} 검색`,
    `
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>검색 결과</h1>
        <p>검색어: ${escapeHtml(query)}</p>
        <form class="search" action="/community/board/search" method="get">
          <input type="text" name="q" value="${escapeHtml(query)}" aria-label="검색어" />
          <button type="submit">검색</button>
        </form>
      </header>
      <section class="panel" aria-label="검색 결과">
        <table class="results">
          <thead><tr><th>번호</th><th>제목</th><th>작성자</th></tr></thead>
          <tbody>${resultRows}</tbody>
        </table>
      </section>
    `,
  );
}

export function renderErrorPage(): string {
  return renderShell(
    "요청 오류",
    `
      <div class="panel"><div class="errorBox">요청을 처리하지 못했습니다.</div><p><a href="/community/board/">게시판으로 돌아가기</a></p></div>
    `,
  );
}

export function createChallengeServer() {
  return createServer((request, response) => {
    const cancellation = new AbortController();
    const abortDisconnectedRequest = () => {
      if (!response.writableFinished) cancellation.abort();
    };
    request.once("aborted", abortDisconnectedRequest);
    response.once("close", abortDisconnectedRequest);
    void handleRequest(request, response, cancellation.signal).catch((error: unknown) => {
      // Do not let a filesystem, upstream, or parsing failure terminate the service.
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(error instanceof UpstreamUnavailableError || error instanceof BoardCapacityError ? 503 : 500, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.\n");
    }).finally(() => {
      request.off("aborted", abortDisconnectedRequest);
      response.off("close", abortDisconnectedRequest);
    });
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, signal: AbortSignal): Promise<void> {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    response.writeHead(400, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("잘못된 요청입니다.\n");
    return;
  }
  const allowedMethod = "GET";
  if (request.method !== allowedMethod) {
    response.writeHead(405, { allow: allowedMethod, "cache-control": "no-store" });
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ status: "ok", service: serviceId }));
    return;
  }

  if (url.pathname === "/") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
    if (!flag) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderBoardHome());
    return;
  }

  if (url.pathname === "/search") {
    const query = url.searchParams.get("q") ?? "";
    const page = await withBoardDatabase(request.headers.cookie, async (dbPath) => {
      try {
        return { status: 200, html: renderSearchResults(query, await searchPosts(dbPath, query, signal)) };
      } catch (error) {
        if (signal.aborted || error instanceof BoardCapacityError) throw error;
        return { status: 400, html: renderErrorPage() };
      }
    }, fetchCurrentUserFlag, signal);
    if (!page) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }
    response.writeHead(page.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(page.html);
    return;
  }

  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("요청한 페이지를 찾을 수 없습니다.\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT ?? 8080);
  createChallengeServer().listen(port, "0.0.0.0");
}
