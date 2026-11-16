import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-03";
const serviceName = "과제 제출 확인";
const unitName = "교무처";
const challengeId = "03";
// Runtime smoke verifies this display metadata against the shared public catalog.
const challengeDifficulty = "초급";
const challengeDifficultyLevel = 2;
const CHALLENGE_CONTEXT = `<div class="challengeContext" aria-label="문제 정보"><span class="challengeNumber">문제 ${challengeId}</span><span class="difficultyBadge" data-level="${challengeDifficultyLevel}">난이도: ${challengeDifficulty}</span></div>`;

const SERVICE_PAGE_STYLE = `
      :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-muted: #f4f3f8; --text: #1a1c1f; --muted: #515f74; --border: #e2e8f0; --accent: #003366; --accent-strong: #001e40; --success: #166534; --warning: #92400e; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: "Pretendard", "Noto Sans KR", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; }
      .challengeContext { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; grid-column: 1 / -1; margin: 0 0 16px; }
      .challengeNumber { color: var(--accent); font-size: .86rem; font-weight: 800; white-space: nowrap; }
      .difficultyBadge { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid currentColor; border-radius: 999px; padding: 2px 10px; font-size: .82rem; font-weight: 800; white-space: nowrap; }
      .difficultyBadge[data-level="2"] { color: #075985; background: #f0f9ff; }
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
      .list { display: grid; gap: 10px; padding: 0; list-style: none; margin: 14px 0 0; }
      .list li { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); padding: 14px 16px; }
      .list a { color: var(--accent); font-weight: 750; text-decoration: none; }
      .badge { display: inline-block; border-radius: 4px; border: 1px solid #bbdcc8; background: #e7f1eb; padding: 2px 10px; font-size: .8rem; color: var(--success); font-weight: 800; }
      .errorBox { border: 1px solid #d8b4b4; background: #fdf3f3; color: #7c2d2d; border-radius: 8px; padding: 16px; }
      .summaryStrip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .summaryItem { border: 1px solid var(--border); border-radius: 4px; background: var(--surface); padding: 16px; }
      .summaryItem span, .summaryItem strong { display: block; }
      .summaryItem span { color: var(--muted); font-size: .82rem; font-weight: 700; }
      .summaryItem strong { margin-top: 6px; color: var(--accent-strong); font-size: 1.4rem; }
      .assignmentTable { width: 100%; border-collapse: collapse; margin-top: 14px; }
      .assignmentTable th, .assignmentTable td { border-top: 1px solid var(--border); padding: 14px 10px; text-align: left; }
      .assignmentTable th { color: var(--muted); font-size: .78rem; letter-spacing: .05em; }
      .assignmentTable tbody tr:nth-child(even) { background: var(--surface-muted); }
      .assignmentTable a { color: var(--accent); font-weight: 750; text-decoration: none; }
      @media (max-width: 640px) { .serviceShell { width: min(100% - 32px, 1280px); } .summaryStrip { grid-template-columns: 1fr; } .panel { overflow-x: auto; } .assignmentTable { min-width: 640px; } }
`;

class UpstreamUnavailableError extends Error {}

type Env = Record<string, string | undefined>;
type SecretFileReader = (path: string) => Promise<string | Buffer>;
type FlagResponse = {
  flagId?: unknown;
  flag?: unknown;
};

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

async function fetchCurrentUserFlag(cookieHeader: string | undefined, signal?: AbortSignal): Promise<string | null> {
  if (!cookieHeader || !/(?:^|;)\s*ctf_session=[^;\s]+/.test(cookieHeader)) return null;
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
    if (body?.flagId !== "FLAG-03" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

export type AssignmentRow = {
  id: number;
  title: string;
  owner: string;
  status: string;
  content?: string;
};

export function buildAssignmentRows(flag: string): AssignmentRow[] {
  return [
    { id: 1, title: "프로그래밍 기초 과제 1", owner: "student01", status: "제출 완료", content: "제출 파일 2건이 정상 확인되었습니다." },
    { id: 2, title: "웹프로그래밍 보고서", owner: "student01", status: "제출 완료", content: "마감 전 제출되어 정상 처리되었습니다." },
    { id: 3, title: "자료구조 실습 보고서", owner: "student02", status: "제출 완료", content: "다른 학생의 제출 내역입니다." },
    { id: 4, title: "비공개 과제 검토", owner: "admin", status: "검토 중", content: `운영 메모: ${flag}` },
  ];
}

export function renderAssignmentList(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${serviceName} | ${unitName}</title>
    <style>${SERVICE_PAGE_STYLE}</style>
  </head>
  <body>
    <header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 CTF</span></a><a class="campusGlobalHomeLink" href="/">문제 목록</a></div></header>
    <main class="serviceShell">
      ${CHALLENGE_CONTEXT}
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>${serviceName}</h1>
        <p>내 제출 현황을 확인합니다. 목록의 항목을 눌러 상세 내용을 볼 수 있습니다.</p>
      </header>
      <section class="summaryStrip" aria-label="제출 요약">
        <div class="summaryItem"><span>전체 과제</span><strong>2건</strong></div>
        <div class="summaryItem"><span>제출 완료</span><strong>2건</strong></div>
        <div class="summaryItem"><span>확인 필요</span><strong>0건</strong></div>
      </section>
      <section class="panel" aria-label="내 제출 현황">
        <h2>내 제출 현황</h2>
        <table class="assignmentTable">
          <thead><tr><th>번호</th><th>과제명</th><th>제출 상태</th><th>상세 조회</th></tr></thead>
          <tbody>
            <tr><td>1</td><td><a href="/challenges/03/view?id=1">프로그래밍 기초 과제 1</a></td><td><span class="badge">제출 완료</span></td><td><a href="/challenges/03/view?id=1">내용 보기</a></td></tr>
            <tr><td>2</td><td><a href="/challenges/03/view?id=2">웹프로그래밍 보고서</a></td><td><span class="badge">제출 완료</span></td><td><a href="/challenges/03/view?id=2">내용 보기</a></td></tr>
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export function renderAssignmentDetail(row: AssignmentRow): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${row.title} | ${serviceName}</title>
    <style>${SERVICE_PAGE_STYLE}</style>
  </head>
  <body>
    <header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 CTF</span></a><a class="campusGlobalHomeLink" href="/">문제 목록</a></div></header>
    <main class="serviceShell">
      ${CHALLENGE_CONTEXT}
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>${escapeHtml(row.title)}</h1>
        <div class="badge">${escapeHtml(row.status)}</div>
      </header>
      <section class="panel" aria-label="상세 정보">
        <h2>상세 정보</h2>
        <p><strong>소유자:</strong> ${escapeHtml(row.owner)}</p>
        <p><strong>내용:</strong></p>
        <p>${escapeHtml(row.content ?? "등록된 내용이 없습니다.")}</p>
        <p><a href="/challenges/03/">목록으로 돌아가기</a></p>
      </section>
    </main>
  </body>
</html>`;
}

export function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8" /><title>요청 오류 | ${serviceName}</title><style>${SERVICE_PAGE_STYLE}</style></head>
  <body><header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 CTF</span></a><a class="campusGlobalHomeLink" href="/">문제 목록</a></div></header><main class="serviceShell">${CHALLENGE_CONTEXT}<div class="panel"><div class="errorBox">${escapeHtml(message)}</div><p><a href="/challenges/03/">목록으로 돌아가기</a></p></div></main></body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendPage(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
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
      response.writeHead(error instanceof UpstreamUnavailableError ? 503 : 500, {
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

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
    if (!flag) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }
    sendPage(response, 200, renderAssignmentList());
    return;
  }

  if (url.pathname === "/view") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
    if (!flag) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }

    const idParam = url.searchParams.get("id") ?? "";
    if (!/^\d+$/.test(idParam)) {
      sendPage(response, 400, renderErrorPage("요청을 처리하지 못했습니다."));
      return;
    }

    const rows = buildAssignmentRows(flag);
    const row = rows.find((item) => item.id === Number(idParam));
    if (!row) {
      sendPage(response, 400, renderErrorPage("요청을 처리하지 못했습니다."));
      return;
    }

    sendPage(response, 200, renderAssignmentDetail(row));
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
