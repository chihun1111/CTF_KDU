import type { FinalSubmitResult, FlagId, SessionState } from "./types";

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
  });
  if (!response.ok) {
    return { authenticated: false };
  }

  return (await response.json()) as SessionState;
}

export function logoutParticipant(): Promise<Response> {
  return postJson("/api/auth/logout");
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
