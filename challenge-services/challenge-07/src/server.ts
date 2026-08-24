import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

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

type Env = Record<string, string | undefined>;
type SecretFileReader = (path: string) => Promise<string | Buffer>;
type FlagResponse = {
  flagId?: unknown;
  flag?: unknown;
};
type CurrentFlagFetcher = (cookieHeader: string | undefined) => Promise<string | null>;

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

function getCookie(cookieHeader: string | undefined, name: string): string | null {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      const value = rawValue.join("=").trim();
      return value || null;
    }
  }
  return null;
}

async function fetchCurrentUserFlag(cookieHeader: string | undefined): Promise<string | null> {
  const serviceToken = await readInternalServiceToken();
  if (!serviceToken) {
    return null;
  }

  const backendRequest = buildFlagBackendRequest({
    backendInternalUrl: process.env.BACKEND_INTERNAL_URL,
    cookieHeader,
    serviceToken,
  });

  try {
    const response = await fetch(backendRequest.url, { headers: backendRequest.headers });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as FlagResponse;
    return body.flagId === "FLAG-07" && typeof body.flag === "string" ? body.flag : null;
  } catch {
    return null;
  }
}

export function buildInstancePath(cookieHeader: string, stateRoot = process.env.STATE_DIR?.trim() || defaultStateRoot): string {
  const sessionToken = getCookie(cookieHeader, "ctf_session") ?? "missing-session";
  const sessionKey = createHash("sha256").update(sessionToken).digest("hex");
  return resolve(stateRoot, `${sessionKey}.sqlite`);
}

export function buildSearchSql(queryExpression: string): string {
  return `SELECT id, title, author FROM posts WHERE title LIKE '%${queryExpression}%'`;
}

async function runSqlite(dbPath: string, statements: string[]): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    // Keep the intended SQL injection inside the per-session SQLite database.
    // Passing attacker-controlled text through stdin would also expose sqlite3
    // dot commands (for example `.shell`) which is outside the challenge scope.
    const child = spawn("sqlite3", ["-safe", "-batch", "-json", dbPath, statements.join("\n")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveOutput(stdout);
      } else {
        reject(new Error(stderr || `sqlite exited with code ${code}`));
      }
    });
  });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function ensureBoardDatabase(
  cookieHeader: string | undefined,
  fetchCurrentFlag: CurrentFlagFetcher = fetchCurrentUserFlag,
): Promise<string | null> {
  if (!cookieHeader || !getCookie(cookieHeader, "ctf_session")) {
    return null;
  }

  const dbPath = buildInstancePath(cookieHeader);
  if (existsSync(dbPath)) {
    return dbPath;
  }

  const flag = await fetchCurrentFlag(cookieHeader);
  if (!flag) {
    return null;
  }

  await mkdir(dirname(dbPath), { recursive: true });
  await runSqlite(dbPath, [
    "CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, author TEXT NOT NULL);",
    "CREATE TABLE flags (id INTEGER PRIMARY KEY, flag TEXT NOT NULL, source TEXT NOT NULL);",
    "INSERT INTO posts (id, title, content, author) VALUES (1, '중간고사 일정 안내', '중간고사 기간에는 상담 운영이 축소됩니다.', '교무과');",
    "INSERT INTO posts (id, title, content, author) VALUES (2, '교내 미니 축제 참가 안내', '부스 신청은 학생처 홈페이지에서 받습니다.', '축제기획단');",
    "INSERT INTO posts (id, title, content, author) VALUES (3, '프로그래밍 과제 안내', '제출 양식과 마감 일정을 확인하세요.', '컴퓨터공학과');",
    "INSERT INTO posts (id, title, content, author) VALUES (4, '도서관 운영 시간 변경 안내', '시험 기간 동안 야간 개방 시간이 연장됩니다.', '도서관');",
    `INSERT INTO flags (id, flag, source) VALUES (1, ${sqlString(flag)}, 'runtime');`,
  ]);

  return dbPath;
}

export async function searchPosts(dbPath: string, queryExpression: string): Promise<Array<Record<string, unknown>>> {
  const output = await runSqlite(dbPath, [buildSearchSql(queryExpression)]);
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
    void handleRequest(request, response);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ status: "ok", service: serviceId }));
    return;
  }

  if (url.pathname === "/") {
    const dbPath = await ensureBoardDatabase(request.headers.cookie);
    if (!dbPath) {
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
    const dbPath = await ensureBoardDatabase(request.headers.cookie);
    if (!dbPath) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }

    const query = url.searchParams.get("q") ?? "";
    try {
      const rows = await searchPosts(dbPath, query);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderSearchResults(query, rows));
    } catch {
      response.writeHead(400, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderErrorPage());
    }
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
