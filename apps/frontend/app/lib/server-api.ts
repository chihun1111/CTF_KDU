import { headers } from "next/headers";
import type {
  AdminOperationsSummary,
  AdminAuditLogItem,
  AdminChallengeStatusItem,
  AdminClearListItem,
  AdminSystemHealth,
  AdminHintsResponse,
  ChallengeProgress,
  ClearCertificate,
  AdminListResponse,
  AdminParticipantListItem,
  AdminSubmissionListItem,
  OnlineSessionCount,
  PublicHintsResponse,
  ServiceHub,
  SessionState,
} from "./types";

type ApiResult<T> =
  | {
      ok: true;
      data: T;
      headers: Headers;
    }
  | {
      ok: false;
      status: number;
      headers: Headers;
    };

function backendBaseUrl(): string {
  return process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8080";
}

async function requestCookieHeader(cookieHeader?: string): Promise<string | undefined> {
  if (cookieHeader !== undefined) {
    return cookieHeader;
  }

  const headerStore = await headers();
  return headerStore.get("cookie") ?? undefined;
}

export async function serverApi<T>(path: string, init: RequestInit = {}, cookieHeader?: string): Promise<ApiResult<T>> {
  const cookie = await requestCookieHeader(cookieHeader);
  const requestHeaders = new Headers(init.headers);
  if (cookie) {
    requestHeaders.set("cookie", cookie);
  }
  if (init.body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const response = await fetch(new URL(path, backendBaseUrl()), {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
    // Never retry mutations: consuming a certificate is a one-use operation.
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    redirect: "error",
  }).catch(() => null);

  if (!response) {
    return { ok: false, status: 502, headers: new Headers() };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
    };
  }

  try {
    return {
      ok: true,
      data: (await response.json()) as T,
      headers: response.headers,
    };
  } catch {
    return { ok: false, status: 502, headers: response.headers };
  }
}

export async function getCurrentSession(): Promise<SessionState> {
  const result = await serverApi<SessionState>("/api/auth/me");
  if (!result.ok) {
    if (result.status === 401) {
      return { authenticated: false };
    }
    throw new Error("인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  return result.data;
}

export async function getServiceHub(): Promise<ApiResult<ServiceHub>> {
  return serverApi<ServiceHub>("/api/services");
}

export async function getProgress(): Promise<ApiResult<ChallengeProgress>> {
  return serverApi<ChallengeProgress>("/api/progress");
}

export async function getPublicHints(): Promise<ApiResult<PublicHintsResponse>> {
  return serverApi<PublicHintsResponse>("/api/hints");
}

export async function consumeClearCertificate(cookieHeader?: string): Promise<ApiResult<ClearCertificate>> {
  return serverApi<ClearCertificate>("/api/clear-certificate/consume", {
    method: "POST",
  }, cookieHeader);
}

export async function getAdminOperationsSummary(): Promise<ApiResult<AdminOperationsSummary>> {
  return serverApi<AdminOperationsSummary>("/api/admin/operations/summary");
}

export async function getOnlineSessionCount(): Promise<ApiResult<OnlineSessionCount>> {
  return serverApi<OnlineSessionCount>("/api/admin/operations/online-count");
}

export async function getAdminParticipants(page = 1): Promise<ApiResult<AdminListResponse<AdminParticipantListItem>>> {
  return serverApi<AdminListResponse<AdminParticipantListItem>>(`/api/admin/participants?page=${page}`);
}

export async function getAdminSubmissions(page = 1): Promise<ApiResult<AdminListResponse<AdminSubmissionListItem>>> {
  return serverApi<AdminListResponse<AdminSubmissionListItem>>(`/api/admin/submissions?page=${page}`);
}

export async function getAdminClears(page = 1): Promise<ApiResult<AdminListResponse<AdminClearListItem>>> {
  return serverApi<AdminListResponse<AdminClearListItem>>(`/api/admin/clears?page=${page}`);
}

export async function getAdminChallengeStatus(): Promise<ApiResult<AdminChallengeStatusItem[]>> {
  return serverApi<AdminChallengeStatusItem[]>("/api/admin/challenges/status");
}

export async function getAdminSystemHealth(): Promise<ApiResult<AdminSystemHealth>> {
  return serverApi<AdminSystemHealth>("/api/admin/system/health");
}

export async function getAdminAuditLogs(page = 1): Promise<ApiResult<AdminListResponse<AdminAuditLogItem>>> {
  return serverApi<AdminListResponse<AdminAuditLogItem>>(`/api/admin/audit-logs?page=${page}`);
}

export async function getAdminHints(): Promise<ApiResult<AdminHintsResponse>> {
  return serverApi<AdminHintsResponse>("/api/admin/hints");
}
