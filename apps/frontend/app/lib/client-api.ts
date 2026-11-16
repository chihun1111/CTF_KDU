import type { FinalSubmitResult, FlagId, SessionState } from "./types";
import { readSessionState } from "./auth-validation";

type RegisterParticipantInput = {
  studentId: string;
  password: string;
  consent: {
    consentVersion: string;
    requiredLoggingAccepted: true;
    analyticsLoggingAccepted: boolean;
    cookieAccepted: true;
  };
};

type LoginParticipantInput = {
  studentId: string;
  password: string;
};

function postJson(path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  };
  if (body) {
    init.headers = {
      "content-type": "application/json",
    };
    init.body = JSON.stringify(body);
  }

  return fetch(path, init);
}

export function registerParticipant(input: RegisterParticipantInput): Promise<Response> {
  return postJson("/api/auth/register", input);
}

export function loginParticipant(input: LoginParticipantInput): Promise<Response> {
  return postJson("/api/auth/login", input);
}

export async function getClientSession(): Promise<SessionState> {
  const response = await fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 401) {
      return { authenticated: false };
    }
    throw new Error("인증 서비스에 연결하지 못했습니다.");
  }

  return readSessionState(await response.json());
}

export class SessionCookieUnavailableError extends Error {
  constructor() {
    super("로그인 쿠키가 유지되지 않았습니다. 쿠키 설정과 접속 주소를 확인해주세요.");
    this.name = "SessionCookieUnavailableError";
  }
}

/** A successful credential request is insufficient when the browser rejected its cookie. */
export async function authenticatedDestination(): Promise<"/admin/operations" | "/"> {
  const session = await getClientSession();
  if (!session.authenticated) {
    throw new SessionCookieUnavailableError();
  }
  return session.role === "admin" ? "/admin/operations" : "/";
}

export async function logoutParticipant(): Promise<void> {
  const response = await postJson("/api/auth/logout");
  if (!response.ok && response.status !== 401) {
    throw new Error("로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function submitFinalFlags(flagsByFlagId: Partial<Record<FlagId, string>>): Promise<{
  response: Response;
  body: FinalSubmitResult | null;
}> {
  const response = await postJson("/api/final-submit", { flagsByFlagId });
  if (!response.ok) {
    return { response, body: null };
  }

  return {
    response,
    body: (await response.json()) as FinalSubmitResult,
  };
}

export function sendPresenceHeartbeat(): Promise<Response> {
  return postJson("/api/presence/heartbeat");
}
