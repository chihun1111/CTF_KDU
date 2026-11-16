import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-02";
const serviceName = "서비스 상태";
const unitName = "전산실";
const challengeId = "02";
// Runtime smoke verifies this display metadata against the shared public catalog.
const challengeDifficulty = "초급";
const challengeDifficultyLevel = 2;
const CHALLENGE_CONTEXT = `<div class="challengeContext" aria-label="문제 정보"><span class="challengeNumber">문제 ${challengeId}</span><span class="difficultyBadge" data-level="${challengeDifficultyLevel}">난이도: ${challengeDifficulty}</span></div>`;
const PUBLIC_PREFIX = "/challenges/02";

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
      .serviceHeader, .statusPanel { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 22px; margin-bottom: 16px; }
      .unit { margin: 0 0 8px; color: var(--accent); font-size: .82rem; font-weight: 800; text-transform: uppercase; }
      h1 { margin: 0; color: var(--accent-strong); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; letter-spacing: -.02em; }
      p { color: var(--muted); line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 12px 10px; border-top: 1px solid var(--border); font-size: .95rem; }
      th { color: var(--muted); font-size: .78rem; letter-spacing: .05em; }
      tbody tr:nth-child(even) { background: var(--surface-muted); }
      .ok { color: var(--success); font-weight: 800; }
      .statusSummary { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-left: 4px solid var(--success); background: #edf7f0; padding: 16px 18px; margin-bottom: 16px; }
      .statusSummary strong { color: var(--success); font-size: 1.05rem; }
      .statusSummary span { color: var(--muted); font-size: .86rem; }
      .maintenanceGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
      .maintenanceItem { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); padding: 14px; }
      .maintenanceItem strong, .maintenanceItem span { display: block; }
      .maintenanceItem span { margin-top: 5px; color: var(--muted); font-size: .86rem; }
      @media (max-width: 640px) { .serviceShell { width: min(100% - 32px, 1280px); } .maintenanceGrid { grid-template-columns: 1fr; } .statusSummary { display: grid; } }
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
    if (body?.flagId !== "FLAG-02" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

export function buildRobotsTxt(): string {
  return `User-agent: *\nDisallow: ${PUBLIC_PREFIX}/api/debug\n`;
}

export function buildStatusBody(): { status: string; checkedAt: string; services: Array<{ name: string; state: string }> } {
  return {
    status: "ok",
    checkedAt: new Date().toISOString(),
    services: [
      { name: "포털", state: "정상" },
      { name: "웹메일", state: "정상" },
      { name: "학습관리시스템", state: "정상" },
      { name: "도서관 시스템", state: "정상" },
    ],
  };
}

export function buildDebugBody(flag: string): { status: string; mode: string; debug: boolean; server: string; flag: string } {
  return {
    status: "ok",
    mode: "development",
    debug: true,
    server: "kductf-status-02",
    flag,
  };
}

export function renderStatusPage(): string {
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
        <p>학교 주요 서비스의 현재 상태를 실시간으로 확인합니다.</p>
      </header>
      <section class="statusSummary" aria-label="전체 상태">
        <strong>모든 주요 서비스가 정상 운영 중입니다</strong>
        <span>상태 정보는 자동으로 갱신됩니다.</span>
      </section>
      <section class="statusPanel" aria-label="서비스 상태">
        <h2>서비스별 현재 상태</h2>
        <table id="status-table">
          <thead><tr><th>서비스</th><th>상태</th></tr></thead>
          <tbody><tr><td colspan="2">상태를 불러오는 중입니다.</td></tr></tbody>
        </table>
        <p style="margin-top:14px;">문의: 전산실 운영팀</p>
      </section>
      <section class="statusPanel" aria-label="점검 이력">
        <h2>최근 점검 이력</h2>
        <div class="maintenanceGrid">
          <div class="maintenanceItem"><strong>학습관리시스템</strong><span>8월 18일 정기 점검 완료</span></div>
          <div class="maintenanceItem"><strong>교내 포털</strong><span>8월 12일 인증 모듈 점검 완료</span></div>
          <div class="maintenanceItem"><strong>웹메일</strong><span>8월 5일 저장소 점검 완료</span></div>
        </div>
      </section>
    </main>
    <script src="${PUBLIC_PREFIX}/assets/status.js"></script>
    <!-- 운영 점검 도구는 내부망에서만 사용합니다. -->
  </body>
</html>`;
}

export function renderStatusScript(): string {
  return `// 서비스 상태 조회 스크립트
// 운영 규칙 문서는 이 상태 서비스의 기본 경로 아래에 있는 표준 파일을 참고하세요.
async function loadStatus() {
  try {
    const res = await fetch("${PUBLIC_PREFIX}/api/status");
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    const tbody = document.querySelector("#status-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const item of data.services) {
      const row = document.createElement("tr");
      row.innerHTML = "<td>" + item.name + "</td><td class='ok'>" + item.state + "</td>";
      tbody.appendChild(row);
    }
  } catch {
    const tbody = document.querySelector("#status-table tbody");
    if (tbody) tbody.innerHTML = "<tr><td colspan='2'>상태 조회에 실패했습니다.</td></tr>";
  }
}
loadStatus();
`;
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

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  });
  response.end(JSON.stringify(body));
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

  if (url.pathname === "/robots.txt") {
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(buildRobotsTxt());
    return;
  }

  if (url.pathname === "/" ) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderStatusPage());
    return;
  }

  if (url.pathname === "/assets/status.js") {
    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderStatusScript());
    return;
  }

  if (url.pathname === "/api/status") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
    if (!flag) {
      sendJson(response, 401, { error: "로그인이 필요합니다." });
      return;
    }
    sendJson(response, 200, buildStatusBody());
    return;
  }

  if (url.pathname === "/api/debug") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
    if (!flag) {
      sendJson(response, 401, { error: "로그인이 필요합니다." });
      return;
    }
    sendJson(response, 200, buildDebugBody(flag));
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
