import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-05";
const serviceName = "동아리 홍보 페이지";
const unitName = "정보보호동아리";
const challengeId = "05";
const PUBLIC_PREFIX = "/clubs/security";

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
      .serviceHeader { display: grid; min-height: 280px; align-content: end; border-top: 8px solid var(--accent); }
      .serviceHeader p:last-child { max-width: 660px; font-size: 1.08rem; }
      .activityGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .activityGrid .panel { min-height: 190px; }
      .activityNumber { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 4px; background: var(--accent); color: #fff; font-weight: 800; }
      .recruitPanel { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-left: 4px solid var(--success); }
      .recruitPanel a { display: inline-flex; min-height: 42px; align-items: center; border-radius: 4px; background: var(--accent); padding: 0 18px; color: #fff; font-weight: 800; text-decoration: none; }
      @media (max-width: 760px) { .serviceShell { width: min(100% - 32px, 1280px); } .activityGrid { grid-template-columns: 1fr; } .recruitPanel { display: grid; } }
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
    if (body?.flagId !== "FLAG-05" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

export function renderPromoPage(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${serviceName}</title>
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
    <main class="serviceShell">
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>정보보호 동아리</h1>
        <p>시스템을 지키는 재미, 함께 배워요. 신입 회원을 상시 모집합니다.</p>
      </header>
      <section class="panel" aria-label="동아리 소개">
        <h2>동아리 소개</h2>
        <p>정보 보호의 기본 원리를 함께 공부하고, 안전한 실습 환경에서 웹·시스템·네트워크 보안을 경험하는 교내 학술 동아리입니다.</p>
      </section>
      <section aria-label="주요 활동">
        <h2>주요 활동</h2>
        <div class="activityGrid">
          <article class="panel"><span class="activityNumber">01</span><h3>주간 스터디</h3><p>기초 이론부터 분야별 심화 주제까지 함께 학습합니다.</p></article>
          <article class="panel"><span class="activityNumber">02</span><h3>보안 실습</h3><p>격리된 교육 환경에서 실제 사례를 바탕으로 실습합니다.</p></article>
          <article class="panel"><span class="activityNumber">03</span><h3>공개 세미나</h3><p>학기별 연구 결과와 프로젝트 경험을 교내 구성원과 나눕니다.</p></article>
        </div>
      </section>
      <section class="panel recruitPanel" aria-label="가입 안내">
        <div><h2>가입 안내</h2><p>전공과 학년에 관계없이 정보 보호에 관심 있는 학생이면 참여할 수 있습니다.</p></div>
        <a href="mailto:security-club@kdu.example">가입 문의</a>
      </section>
    </main>
    <script src="${PUBLIC_PREFIX}/assets/main.js"></script>
  </body>
</html>`;
}

export function renderMainScript(flag: string): string {
  return `// ${serviceName} 스크립트
document.addEventListener("DOMContentLoaded", function () {
  var hero = document.querySelector(".serviceHeader");
  if (hero) hero.setAttribute("data-banner", "legacy-banner-v1");
});
// BUILD NOTE(deploy): legacy banner id kept for rollback: ${flag}
//# sourceMappingURL=/clubs/build-archive/assets/main.js.map
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
    response.end(renderPromoPage());
    return;
  }

  if (url.pathname === "/assets/main.js") {
    const flag = await fetchCurrentUserFlag(request.headers.cookie, signal);
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
    response.end(renderMainScript(flag));
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
