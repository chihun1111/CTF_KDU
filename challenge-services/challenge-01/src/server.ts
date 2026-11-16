import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-01";
const serviceName = "2026 교내 미니 축제 안내";
const unitName = "축제기획단";
const challengeId = "01";

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
      .pageFrame { min-height: 100vh; }
      .serviceNav { border-bottom: 1px solid var(--border); background: var(--surface); }
      .serviceNavInner { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: min(1280px, calc(100% - 48px)); min-height: 58px; margin: 0 auto; }
      .serviceBrand { font-weight: 900; }
      .serviceShell { width: min(1280px, calc(100% - 48px)); margin: 0 auto; padding: 40px 0; }
      .serviceHeader, .infoPanel { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 22px; }
      .serviceHeader { margin-bottom: 16px; }
      .metaStrip { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: .86rem; }
      .metaStrip span { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); padding: 5px 10px; }
      .unit { margin: 0 0 8px; color: var(--accent); font-size: .82rem; font-weight: 800; text-transform: uppercase; }
      h1 { margin: 0; color: var(--accent-strong); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; letter-spacing: -.02em; }
      p { color: var(--muted); line-height: 1.6; }
      .infoList { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
      .infoList li { border-top: 1px solid var(--border); padding-top: 12px; }
      .festivalGrid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; }
      .scheduleList { display: grid; margin-top: 16px; border-top: 1px solid var(--border); }
      .scheduleRow { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 16px; align-items: center; border-bottom: 1px solid var(--border); padding: 16px 0; }
      .scheduleRow time { color: var(--accent); font-weight: 800; }
      .scheduleRow strong, .scheduleRow span { display: block; }
      .scheduleRow span { color: var(--muted); font-size: .88rem; }
      .boothPanel { grid-column: 1 / -1; margin-top: 16px; }
      .boothGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
      .boothCard { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); padding: 14px; }
      .boothCard strong, .boothCard span { display: block; }
      .boothCard span { margin-top: 4px; color: var(--muted); font-size: .86rem; }
      @media (max-width: 760px) { .festivalGrid { grid-template-columns: 1fr; } .boothGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .scheduleRow { grid-template-columns: 76px 1fr; } .scheduleRow > span { grid-column: 2; } .serviceShell, .serviceNavInner { width: min(100% - 32px, 1280px); } }
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

async function fetchCurrentUserFlag(cookieHeader: string | undefined): Promise<string | null> {
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
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) return null;
      throw new UpstreamUnavailableError("Flag service is unavailable");
    }
    const body = (await response.json()) as FlagResponse;
    if (body?.flagId !== "FLAG-01" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

export function renderFestivalPage(flag: string): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${serviceName}</title>
    <style>${SERVICE_PAGE_STYLE}</style>
  </head>
  <body>
    <div class="pageFrame">
      <header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 서비스</span></a><a class="campusGlobalHomeLink" href="/hub">전체 서비스</a></div></header>
      <nav class="serviceNav" aria-label="서비스 메뉴">
        <div class="serviceNavInner">
          <span class="serviceBrand">${unitName}</span>
          <span style="color:var(--muted);font-size:.9rem;font-weight:750;">학교 축제</span>
        </div>
      </nav>
      <main class="serviceShell">
        <header class="serviceHeader">
          <p class="unit">${unitName}</p>
          <h1>${serviceName}</h1>
          <p>올해 미니 축제 일정과 부스 안내를 한곳에서 확인하세요. 즐거운 축제 되시길 바랍니다.</p>
          <div class="metaStrip"><span>행사 기간: 2026.09</span><span>장소: 본관 앞 광장</span><span>주관: ${unitName}</span></div>
        </header>
        <div class="festivalGrid">
          <section class="infoPanel" aria-label="축제 일정">
            <h2>행사 일정</h2>
            <div class="scheduleList">
              <div class="scheduleRow"><time>10:00</time><div><strong>개막식</strong><span>축제 첫째 날</span></div><span>본관 앞 광장</span></div>
              <div class="scheduleRow"><time>11:00</time><div><strong>학과 체험 부스</strong><span>매일 운영</span></div><span>학생회관 앞</span></div>
              <div class="scheduleRow"><time>15:00</time><div><strong>동아리 공연</strong><span>둘째 날</span></div><span>야외 무대</span></div>
              <div class="scheduleRow"><time>17:00</time><div><strong>폐막식</strong><span>마지막 날</span></div><span>야외 무대</span></div>
            </div>
          </section>
          <section class="infoPanel" aria-label="주요 안내">
            <h2>주요 안내</h2>
            <ul class="infoList">
              <li>부스 방문 시 발급받은 이용권을 보관해 주세요.</li>
              <li>행사장 주변 주차 공간이 협소하니 대중교통 이용을 권장합니다.</li>
              <li>분실물은 학생회관 1층 안내 데스크에서 확인할 수 있습니다.</li>
            </ul>
          </section>
          <section class="infoPanel boothPanel" aria-label="부스 안내">
            <h2>부스 안내</h2>
            <div class="boothGrid">
              <div class="boothCard"><strong>컴퓨터공학과</strong><span>웹 서비스 체험</span></div>
              <div class="boothCard"><strong>정보보호학과</strong><span>보안 상식 퀴즈</span></div>
              <div class="boothCard"><strong>동아리연합회</strong><span>활동 전시 및 상담</span></div>
              <div class="boothCard"><strong>학생지원팀</strong><span>행사 종합 안내</span></div>
            </div>
          </section>
        </div>
        <section id="draft-panel" hidden aria-hidden="true">
          <p>초안 문구는 내부 검토 후 공개됩니다.</p>
        </section>
      </main>
    </div>
    <!-- draft: 부스 배치 확정 후 이 문구를 업데이트할 것 -->
    <!-- TODO(festival-admin): 임시 보관 문구 - 종료 후 삭제: archive-note: ${flag} -->
  </body>
</html>`;
}

export function createChallengeServer() {
  return createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
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
    });
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
    response.end(renderFestivalPage(flag));
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
