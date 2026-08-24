import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-04";
const serviceName = "동아리 운영 현황";
const unitName = "동아리연합회";
const challengeId = "04";
const PUBLIC_PREFIX = "/clubs/admin";

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
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 12px 10px; border-top: 1px solid var(--border); font-size: .95rem; }
      th { color: var(--muted); font-size: .78rem; letter-spacing: .05em; }
      tbody tr:nth-child(even) { background: var(--surface-muted); }
      #admin-panel[hidden] { display: none; }
      #flag-box { font-weight: 800; letter-spacing: .02em; word-break: break-all; }
      .metricGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .metricCard { border: 1px solid var(--border); border-radius: 4px; background: var(--surface); padding: 18px; }
      .metricCard span, .metricCard strong, .metricCard small { display: block; }
      .metricCard span { color: var(--muted); font-size: .82rem; font-weight: 700; }
      .metricCard strong { margin-top: 8px; color: var(--accent-strong); font-size: 1.7rem; }
      .metricCard small { margin-top: 6px; color: var(--success); }
      @media (max-width: 640px) { .serviceShell { width: min(100% - 32px, 1280px); } .metricGrid { grid-template-columns: 1fr; } .panel { overflow-x: auto; } table { min-width: 560px; } }
`;

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
    return body.flagId === "FLAG-04" && typeof body.flag === "string" ? body.flag : null;
  } catch {
    return null;
  }
}

export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${serviceName} | ${unitName}</title>
    <style>${SERVICE_PAGE_STYLE}</style>
  </head>
  <body>
    <header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 서비스</span></a><a class="campusGlobalHomeLink" href="/hub">전체 서비스</a></div></header>
    <main class="serviceShell">
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>${serviceName}</h1>
        <p>등록 현황, 활동 보고와 정산 처리 상태를 한눈에 확인합니다.</p>
      </header>
      <section class="metricGrid" aria-label="운영 요약">
        <div class="metricCard"><span>운영 동아리 수</span><strong>42개</strong><small>지난 학기 대비 3개 증가</small></div>
        <div class="metricCard"><span>활동 보고 접수</span><strong>118건</strong><small>제출률 92%</small></div>
        <div class="metricCard"><span>정산 대기 건수</span><strong>3건</strong><small>이번 주 처리 예정</small></div>
      </section>
      <section class="panel" aria-label="운영 지표">
        <h2>활동 보고 및 정산</h2>
        <table>
          <thead><tr><th>구분</th><th>접수</th><th>완료</th><th>현재 상태</th></tr></thead>
          <tbody>
            <tr><td>동아리 등록</td><td>42건</td><td>42건</td><td>처리 완료</td></tr>
            <tr><td>활동 보고</td><td>118건</td><td>109건</td><td>검토 중</td></tr>
            <tr><td>회비 정산</td><td>42건</td><td>39건</td><td>3건 대기</td></tr>
          </tbody>
        </table>
      </section>
      <section id="admin-panel" class="panel" hidden aria-label="관리자 패널">
        <h2>관리자 확인란</h2>
        <p>관리자 권한으로 접속했습니다.</p>
        <div id="flag-box"></div>
      </section>
    </main>
    <script src="${PUBLIC_PREFIX}/assets/app.js"></script>
  </body>
</html>`;
}

export function renderAdminScript(flag: string): string {
  return `// 운영 현황 화면 초기화 스크립트
(function () {
  if (localStorage.getItem("isAdmin") === null) {
    localStorage.setItem("isAdmin", "false");
  }
  if (localStorage.getItem("isAdmin") === "true") {
    var panel = document.getElementById("admin-panel");
    var box = document.getElementById("flag-box");
    if (panel) panel.removeAttribute("hidden");
    if (box) box.textContent = ${JSON.stringify(flag)};
  }
})();
`;
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
    const flag = await fetchCurrentUserFlag(request.headers.cookie);
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
    response.end(renderAdminPage());
    return;
  }

  if (url.pathname === "/assets/app.js") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie);
    if (!flag) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("// 로그인이 필요합니다.\n");
      return;
    }
    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderAdminScript(flag));
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
