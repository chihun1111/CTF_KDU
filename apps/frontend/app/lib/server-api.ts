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
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
    };
  }

  return {
    ok: true,
    data: (await response.json()) as T,
    headers: response.headers,
  };
}

export async function getCurrentSession(): Promise<SessionState> {
  try {
    const result = await serverApi<SessionState>("/api/auth/me");
    if (!result.ok) {
      return { authenticated: false };
    }

    return result.data;
  } catch {
    return { authenticated: false };
  }
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

export async function getAdminParticipants(): Promise<ApiResult<AdminListResponse<AdminParticipantListItem>>> {
  return serverApi<AdminListResponse<AdminParticipantListItem>>("/api/admin/participants");
}

export async function getAdminSubmissions(): Promise<ApiResult<AdminListResponse<AdminSubmissionListItem>>> {
  return serverApi<AdminListResponse<AdminSubmissionListItem>>("/api/admin/submissions");
}

export async function getAdminClears(): Promise<ApiResult<AdminListResponse<AdminClearListItem>>> {
  return serverApi<AdminListResponse<AdminClearListItem>>("/api/admin/clears");
}

export async function getAdminChallengeStatus(): Promise<ApiResult<AdminChallengeStatusItem[]>> {
  return serverApi<AdminChallengeStatusItem[]>("/api/admin/challenges/status");
}

export async function getAdminSystemHealth(): Promise<ApiResult<AdminSystemHealth>> {
  return serverApi<AdminSystemHealth>("/api/admin/system/health");
}

export async function getAdminAuditLogs(): Promise<ApiResult<AdminListResponse<AdminAuditLogItem>>> {
  return serverApi<AdminListResponse<AdminAuditLogItem>>("/api/admin/audit-logs");
}

export async function getAdminHints(): Promise<ApiResult<AdminHintsResponse>> {
  return serverApi<AdminHintsResponse>("/api/admin/hints");
}
