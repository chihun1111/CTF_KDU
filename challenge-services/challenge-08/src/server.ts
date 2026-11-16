import { readFile } from "node:fs/promises";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const serviceId = "service-08";
const serviceName = "특별상 수령 안내";
const unitName = "축제준비위원회";
const challengeId = "08";
// Runtime smoke verifies these rendered values against the shared public catalog.
const challengeDifficulty = "고급";
const challengeDifficultyLevel = 4;
const ACCESS_GRANT_TTL_MS = 10 * 60 * 1000;
const PUBLIC_PREFIX = "/challenges/08";

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
      .challengeContext { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; grid-column: 1 / -1; margin: 0 0 16px; }
      .challengeNumber { color: var(--accent); font-size: .86rem; font-weight: 800; white-space: nowrap; }
      .difficultyBadge { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid currentColor; border-radius: 999px; padding: 2px 10px; color: #6b21a8; background: #faf5ff; font-size: .82rem; font-weight: 800; white-space: nowrap; }
      .serviceHeader, .panel { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 22px; margin-bottom: 16px; }
      .unit { margin: 0 0 8px; color: var(--accent); font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
      h1 { margin: 0; color: var(--accent-strong); font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; letter-spacing: -.02em; }
      h2 { margin-top: 0; }
      p { color: var(--muted); line-height: 1.6; }
      form button { border: 1px solid var(--accent); background: var(--accent); color: #ffffff; border-radius: 4px; padding: 10px 18px; font-weight: 800; cursor: pointer; }
      .vaultBox { border: 1px solid var(--border); border-left: 4px solid var(--warning); border-radius: 4px; background: #fff8f0; padding: 18px; margin-top: 14px; }
      .roleTag { display: inline-block; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-muted); color: var(--accent); padding: 3px 12px; font-weight: 800; }
      .verificationValue { font-weight: 900; font-size: 1.15rem; word-break: break-all; }
      .vaultLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr); gap: 16px; align-items: start; }
      .vaultLayout .serviceHeader, .vaultLayout .panel { margin: 0; }
      .warningLabel { display: inline-flex; border-radius: 4px; background: #fff0dd; padding: 4px 9px; color: var(--warning); font-size: .76rem; font-weight: 800; }
      .ticketMeta { display: grid; gap: 10px; margin: 16px 0; }
      .ticketMeta div { display: grid; grid-template-columns: 120px 1fr; gap: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
      .ticketMeta dt { color: var(--muted); font-size: .82rem; font-weight: 700; }
      .ticketMeta dd { margin: 0; color: var(--accent-strong); font-family: ui-monospace, monospace; font-size: .86rem; overflow-wrap: anywhere; }
      @media (max-width: 760px) { .serviceShell { width: min(100% - 32px, 1280px); } .vaultLayout { grid-template-columns: 1fr; } }
`;

class UpstreamUnavailableError extends Error {}

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
    if (body?.flagId !== "FLAG-08" || typeof body.flag !== "string") {
      throw new UpstreamUnavailableError("Invalid flag service response");
    }
    return body.flag;
  } catch {
    throw new UpstreamUnavailableError("Flag service is unavailable");
  }
}

// 티켓 서명은 키를 메시지 앞에 붙이는 단순 prefix MAC 구조입니다.
// (의도적으로 취약한 구조 - 이 문제의 퍼즐은 길이 확장 공격입니다.)
export function sessionBindingFromCookie(cookieHeader: string | undefined): string | null {
  const sessionToken = readSessionToken(cookieHeader);
  return sessionToken ? createHash("sha256").update(sessionToken).digest("hex") : null;
}

export function deriveVaultKey(serviceToken: string, sessionBinding: string): Buffer {
  return createHash("sha256").update(`kductf-vault:${serviceToken}:${sessionBinding}`).digest();
}

export function signPayload(key: Buffer, payload: Buffer | string): string {
  const payloadBytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  return createHash("sha256").update(Buffer.concat([key, payloadBytes])).digest("hex");
}

export function buildGuestPayload(visitEpochSeconds = Math.floor(Date.now() / 1000)): string {
  return `visit=${visitEpochSeconds}&holder=guest&role=guest`;
}

export function encodeTicketValue(key: Buffer, payload: string): string {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${signPayload(key, payload)}`;
}

export type ParsedTicket = {
  // 서명 대상은 임의 바이트열이므로 디코딩 손실 없는 Buffer로 다룹니다.
  // (길이 확장 공격으로 삽입되는 glue padding은 유효한 UTF-8이 아닙니다.)
  payload: Buffer;
  providedSignature: string;
};

export function parseTicketValue(ticketValue: string): ParsedTicket | null {
  const separatorIndex = ticketValue.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === ticketValue.length - 1) {
    return null;
  }

  const encoded = ticketValue.slice(0, separatorIndex);
  try {
    return {
      payload: Buffer.from(encoded, "base64url"),
      providedSignature: ticketValue.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function verifyTicket(key: Buffer, ticketValue: string): Buffer | null {
  const parsed = parseTicketValue(ticketValue);
  if (!parsed) {
    return null;
  }

  const expected = Buffer.from(signPayload(key, parsed.payload), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(parsed.providedSignature, "hex");
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  return parsed.payload;
}

// 일부 웹 프레임워크처럼 중복 키가 있으면 마지막 값을 채택하는 파서입니다.
export function readClaims(payload: Buffer | string): Record<string, string> {
  const text = typeof payload === "string" ? payload : payload.toString("latin1");
  const claims: Record<string, string> = {};
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
    try {
      claims[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
    } catch {
      claims[rawKey] = rawValue;
    }
  }
  return claims;
}

export function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

export type AccessGrant = {
  expiresAt: number;
  bonusCookieValue: string;
  sessionBinding: string;
};

export type AccessGrantStore = {
  issue(sessionBinding: string): string;
  peek(token: string): AccessGrant | undefined;
  consume(token: string, sessionBinding: string): AccessGrant | undefined;
};

export function createGrantStore(now: () => number = Date.now, maxEntries = 10_000): AccessGrantStore {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Access grant capacity must be a positive integer");
  }
  const grants = new Map<string, AccessGrant>();
  const sessionTokens = new Map<string, string>();
  const remove = (token: string, grant: AccessGrant) => {
    grants.delete(token);
    if (sessionTokens.get(grant.sessionBinding) === token) sessionTokens.delete(grant.sessionBinding);
  };
  const pruneExpired = () => {
    const timestamp = now();
    for (const [token, grant] of grants) {
      if (grant.expiresAt <= timestamp) remove(token, grant);
    }
  };
  return {
    issue(sessionBinding: string): string {
      pruneExpired();
      // Concurrent checks must not invalidate a redirect already sent to this session.
      const previousToken = sessionTokens.get(sessionBinding);
      if (previousToken && grants.has(previousToken)) return previousToken;
      if (grants.size >= maxEntries) throw new Error("Access grant capacity exceeded");
      const token = randomBytes(24).toString("hex");
      grants.set(token, {
        expiresAt: now() + ACCESS_GRANT_TTL_MS,
        bonusCookieValue: randomBytes(32).toString("hex"),
        sessionBinding,
      });
      sessionTokens.set(sessionBinding, token);
      return token;
    },
    peek(token: string): AccessGrant | undefined {
      const grant = grants.get(token);
      if (grant && grant.expiresAt <= now()) {
        remove(token, grant);
        return undefined;
      }
      return grant;
    },
    consume(token: string, sessionBinding: string): AccessGrant | undefined {
      const grant = this.peek(token);
      if (!grant || grant.sessionBinding !== sessionBinding) return undefined;
      remove(token, grant);
      return grant;
    },
  };
}

export function consumeAccessGrant(
  grants: AccessGrantStore,
  accessCookie: string | undefined,
  bonusCookie: string | undefined,
  sessionBinding: string,
): AccessGrant | undefined {
  if (!accessCookie || !bonusCookie) {
    return undefined;
  }

  const grant = grants.peek(accessCookie);
  if (!grant || grant.bonusCookieValue !== bonusCookie || grant.sessionBinding !== sessionBinding) {
    return undefined;
  }

  return grants.consume(accessCookie, sessionBinding);
}

export function buildAccessGrantRedirect(token: string, bonusCookieValue: string): {
  location: string;
  "set-cookie": string[];
} {
  return {
    location: `${PUBLIC_PREFIX}/prize`,
    "set-cookie": [
      `bonus_access=${token}; Path=${PUBLIC_PREFIX}/prize; HttpOnly; Secure; SameSite=Strict; Max-Age=600`,
      `bonus_success=${bonusCookieValue}; Path=${PUBLIC_PREFIX}/prize; HttpOnly; Secure; SameSite=Strict; Max-Age=600`,
    ],
  };
}

const grantStore = createGrantStore();

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
        <a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기">
          <span class="campusGlobalBrandMark">KDU</span>
          <span class="campusGlobalBrandText">교내 CTF</span>
        </a>
        <a class="campusGlobalHomeLink" href="/">문제 목록</a>
      </div>
    </header>
    <main class="serviceShell">
      <div class="challengeContext" aria-label="문제 정보"><span class="challengeNumber">문제 ${challengeId}</span><span class="difficultyBadge" data-level="${challengeDifficultyLevel}">난이도: ${challengeDifficulty}</span></div>
      ${bodyContent}
    </main>
  </body>
</html>`;
}

export function renderVaultPage(role: string): string {
  return renderShell(
    serviceName,
    `
      <div class="vaultLayout">
        <header class="serviceHeader">
          <span class="warningLabel">수령자 확인 필요</span>
          <p class="unit">${unitName}</p>
          <h1>${serviceName}</h1>
          <p>미니 축제 특별상 수령자 확인 창구입니다. 발급된 티켓 정보를 확인한 뒤 수령 절차를 진행해 주세요.</p>
          <div class="vaultBox">
            <h2>티켓 확인</h2>
            <dl class="ticketMeta">
              <div><dt>수령자 유형</dt><dd>holder: ${escapeHtml(readClaims(buildGuestPayload()).holder)}</dd></div>
              <div><dt>현재 권한</dt><dd>role: ${escapeHtml(role)}</dd></div>
              <div><dt>처리 상태</dt><dd>확인 대기</dd></div>
            </dl>
            <form method="post" action="${PUBLIC_PREFIX}/check">
              <button type="submit">티켓 확인</button>
            </form>
          </div>
        </header>
        <section class="panel" aria-label="수령 안내">
          <h2>수령 안내</h2>
          <p>특별상은 확인을 마친 수령자에게만 제공됩니다.</p>
          <p>확인 완료 화면을 행사 운영 데스크에 제시해 주세요.</p>
          <p>티켓은 한 번만 사용할 수 있습니다.</p>
        </section>
      </div>
    `,
  );
}

export function renderDeniedPage(role: string): string {
  return renderShell(
    "접근 거부",
    `
      <div class="panel">
        <h2>열리지 않았습니다</h2>
        <p>현재 권한으로는 금고를 열 수 없습니다. <span class="roleTag">role: ${escapeHtml(role)}</span></p>
        <p><a href="${PUBLIC_PREFIX}/" style="color:var(--accent)">처음으로</a></p>
      </div>
    `,
  );
}

export function renderPrizePage(flag: string): string {
  return renderShell(
    "특별상 최종 확인",
    `
      <header class="serviceHeader">
        <p class="unit">${unitName}</p>
        <h1>특별상 최종 확인</h1>
        <div class="vaultBox">
          <p>축하합니다. 아래 인증 값을 운영자에게 보여주세요.</p>
          <div class="verificationValue">${escapeHtml(flag)}</div>
        </div>
      </header>
    `,
  );
}

function sendPage(
  response: ServerResponse,
  status: number,
  html: string,
  headers: Record<string, string | string[]> = {},
): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(html);
}

async function resolveVaultKeyAndSession(
  cookieHeader: string | undefined,
  signal?: AbortSignal,
): Promise<{ key: Buffer; flag: string; sessionBinding: string } | null> {
  const flag = await fetchCurrentUserFlag(cookieHeader, signal);
  const serviceToken = await readInternalServiceToken();
  signal?.throwIfAborted();
  const sessionBinding = sessionBindingFromCookie(cookieHeader);
  if (!flag || !serviceToken || !sessionBinding) {
    return null;
  }
  return { key: deriveVaultKey(serviceToken, sessionBinding), flag, sessionBinding };
}

export function createChallengeServer(grants = grantStore) {
  return createServer((request, response) => {
    const cancellation = new AbortController();
    const abortDisconnectedRequest = () => {
      if (!response.writableFinished) cancellation.abort();
    };
    request.once("aborted", abortDisconnectedRequest);
    response.once("close", abortDisconnectedRequest);
    void handleRequest(request, response, cancellation.signal, grants).catch((error: unknown) => {
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

async function handleRequest(request: IncomingMessage, response: ServerResponse, signal: AbortSignal, grants = grantStore): Promise<void> {
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
  const allowedMethod = url.pathname === "/check" ? "POST" : "GET";
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
    const context = await resolveVaultKeyAndSession(request.headers.cookie, signal);
    if (!context) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }

    const ticket = getCookie(request.headers.cookie, "vault_ticket");
    const payload = ticket ? verifyTicket(context.key, ticket) : null;
    if (!ticket || !payload) {
      // 티켓은 참가자가 내용을 볼 수 있어야 하므로 HttpOnly를 붙이지 않습니다.
      // 위조 방지는 서명의 역할이며, 이 문제의 목표는 그 서명을 확장해 넘는 것입니다.
      sendPage(response, 200, renderVaultPage("guest"), {
        "set-cookie": `vault_ticket=${encodeTicketValue(context.key, buildGuestPayload())}; Path=${PUBLIC_PREFIX}; SameSite=Lax`,
      });
      return;
    }

    const claims = readClaims(payload);
    sendPage(response, 200, renderVaultPage(claims.role ?? "unknown"));
    return;
  }

  if (url.pathname === "/check" && request.method === "POST") {
    const context = await resolveVaultKeyAndSession(request.headers.cookie, signal);
    if (!context) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }

    const ticket = getCookie(request.headers.cookie, "vault_ticket");
    const payload = ticket ? verifyTicket(context.key, ticket) : null;
    const role = payload ? readClaims(payload).role ?? "unknown" : "guest";
    if (!payload || role !== "winner") {
      sendPage(response, 403, renderDeniedPage(role));
      return;
    }

    let token: string;
    try {
      token = grants.issue(context.sessionBinding);
    } catch {
      sendPage(response, 503, renderShell("잠시 후 다시 시도", "<div class=\"panel\"><p>요청이 많습니다. 잠시 후 다시 시도해 주세요.</p></div>"));
      return;
    }
    const grant = grants.peek(token);
    if (!grant) {
      sendPage(response, 500, renderDeniedPage(role));
      return;
    }

    response.writeHead(303, {
      ...buildAccessGrantRedirect(token, grant.bonusCookieValue),
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  if (url.pathname === "/prize") {
    // A speculative load or embedded resource must not spend a one-use grant.
    // Same-origin fetch remains supported for participants solving the puzzle.
    const purpose = [request.headers.purpose, request.headers["sec-purpose"]].join(" ");
    const site = request.headers["sec-fetch-site"];
    const destination = request.headers["sec-fetch-dest"];
    if (/\b(?:prefetch|prerender)\b/i.test(purpose)
      || site === "cross-site" || site === "same-site"
      || (destination && destination !== "document" && destination !== "empty")) {
      response.writeHead(403, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("페이지를 직접 열어 수령 권한을 확인해 주세요.\n");
      return;
    }
    const context = await resolveVaultKeyAndSession(request.headers.cookie, signal);
    if (!context) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      });
      response.end("로그인이 필요합니다.\n");
      return;
    }

    const accessCookie = getCookie(request.headers.cookie, "bonus_access");
    const bonusCookie = getCookie(request.headers.cookie, "bonus_success");
    const grant = consumeAccessGrant(grants, accessCookie, bonusCookie, context.sessionBinding);
    if (!grant) {
      sendPage(response, 403, renderShell("접근 거부", "<div class=\"panel\"><h2>확인 실패</h2><p>수령 권한이 없거나 이미 사용된 링크입니다.</p></div>"));
      return;
    }

    sendPage(response, 200, renderPrizePage(context.flag));
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
