import type { OnlineCountService } from "../presence/online-count.service.js";
import { createHash } from "node:crypto";

export type AdminSystemHealthStatus = "ok" | "degraded" | "down";

export type AdminOperationsSummary = {
  onlineSessionCount: number;
  registeredUserCount: number;
  submittedUserCount: number;
  clearedUserCount: number;
  finalSubmissionCount: number;
  systemHealth: {
    backend: AdminSystemHealthStatus;
    postgres: AdminSystemHealthStatus;
    redis: AdminSystemHealthStatus;
    challengeServices: {
      ok: number;
      degraded: number;
      down: number;
    };
  };
  generatedAt: string;
};

export type AdminOperationsSummaryCounts = Omit<AdminOperationsSummary, "onlineSessionCount" | "systemHealth" | "generatedAt">;

export type AdminParticipantListItem = {
  participantRef: string;
  role: "participant" | "admin";
  registeredAt: string;
  lastSeenAt: string | null;
  online: boolean;
  latestCorrectCount: number;
  requiredCount: 8;
  cleared: boolean;
  clearedAt: string | null;
  finalSubmissionCount: number;
};

export type AdminSubmissionListItem = {
  id: string;
  participantRef: string;
  correctCount: number;
  requiredCount: 8;
  isClear: boolean;
  resultsByFlagId: Partial<Record<string, { correct: boolean }>>;
  createdAt: string;
};

export type AdminClearListItem = {
  participantRef: string;
  clearedAt: string;
};

export type AdminListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type AdminParticipantRow = Omit<AdminParticipantListItem, "registeredAt" | "lastSeenAt" | "clearedAt"> & {
  registeredAt: Date;
  lastSeenAt: Date | null;
  clearedAt: Date | null;
};

export type AdminSubmissionRow = Omit<AdminSubmissionListItem, "createdAt" | "resultsByFlagId"> & {
  createdAt: Date;
  resultsByFlagId: Partial<Record<string, { correct: boolean }>>;
};

export type AdminClearRow = Omit<AdminClearListItem, "clearedAt"> & {
  clearedAt: Date;
};

export type AdminChallengeStatusItem = {
  challengeId: string;
  flagId: string;
  title: string;
  servicePath: string;
  health: AdminSystemHealthStatus;
  visible: boolean;
  solvedCount: number;
  lastHealthcheckAt: string;
};

export type AdminSystemHealth = {
  backend: { status: AdminSystemHealthStatus; checkedAt: string };
  postgres: { status: AdminSystemHealthStatus; latencyMs: number };
  redis: { status: AdminSystemHealthStatus; latencyMs: number };
  challengeServices: Array<{ challengeId: string; status: AdminSystemHealthStatus; latencyMs: number }>;
};

export type AdminAuditLogItem = {
  id: string;
  actorRef: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminAuditLogRow = {
  id: string;
  userId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type AdminSystemHealthSnapshot = {
  postgresLatencyMs: number;
};

export type AdminOperationsStore = {
  getSummaryCounts(): Promise<AdminOperationsSummaryCounts>;
  listParticipants(input: { page: number; pageSize: number; now: Date }): Promise<AdminListResponse<AdminParticipantRow>>;
  listSubmissions(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminSubmissionRow>>;
  listClears(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminClearRow>>;
  listChallengeStatus(now: Date): Promise<AdminChallengeStatusItem[]>;
  listAuditLogs(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminAuditLogRow>>;
  getSystemHealthSnapshot(): Promise<AdminSystemHealthSnapshot>;
};

type OnlineCountReader = Pick<OnlineCountService, "getOnlineCount">;

export type ChallengeHealthEndpoint = {
  challengeId: string;
  url: string;
};

export type ChallengeHealthProbeResult = {
  challengeId: string;
  status: AdminSystemHealthStatus;
  latencyMs: number;
};

export type ChallengeHealthChecker = {
  check(endpoint: ChallengeHealthEndpoint): Promise<ChallengeHealthProbeResult>;
};

const CHALLENGE_HEALTH_ENDPOINTS: readonly ChallengeHealthEndpoint[] = Array.from({ length: 8 }, (_, index) => {
  const challengeId = String(index + 1).padStart(2, "0");
  return {
    challengeId,
    url: process.env[`CHALLENGE_${challengeId}_HEALTH_URL`] ?? `http://challenge-${challengeId}:8080/health`,
  };
});

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

const defaultChallengeHealthChecker: ChallengeHealthChecker = {
  async check(endpoint) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 750);
    try {
      const response = await fetch(endpoint.url, { signal: controller.signal });
      return {
        challengeId: endpoint.challengeId,
        status: response.ok ? "ok" : "degraded",
        latencyMs: elapsedMs(start),
      };
    } catch {
      return {
        challengeId: endpoint.challengeId,
        status: "down",
        latencyMs: elapsedMs(start),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

const AUDIT_METADATA_KEYS_BY_ACTION: Record<string, readonly string[]> = {
  FINAL_SUBMIT: ["logCategory", "correctCount", "requiredCount", "submittedCount", "cleared"],
  ADMIN_SUMMARY_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_ONLINE_COUNT_VIEWED: ["logCategory", "resource", "onlineSessionCount", "source", "windowSeconds", "generatedAt"],
  ADMIN_PARTICIPANTS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_PARTICIPANT_DETAIL_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_SUBMISSIONS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_CLEARS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_CHALLENGE_STATUS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_SYSTEM_HEALTH_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_AUDIT_LOGS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_HINTS_VIEWED: ["logCategory", "resource", "page", "pageSize"],
  ADMIN_HINT_STAGE_RELEASED: ["logCategory", "resource", "stageId", "challengeNumber", "stageKey"],
  CLAIM_VERIFY_FAILED: ["logCategory", "reason", "challengeId", "flagId"],
  ARTIFACT_GENERATION_FAILED: ["logCategory", "reason", "challengeId"],
};

const SAFE_AUDIT_METADATA_KEYS = new Set([
  ...Object.values(AUDIT_METADATA_KEYS_BY_ACTION).flat(),
]);

function isSafeAuditMetadataValue(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function sanitizeAuditMetadata(action: string, metadata: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const allowedKeys = AUDIT_METADATA_KEYS_BY_ACTION[action] ?? [...SAFE_AUDIT_METADATA_KEYS];
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const key of allowedKeys) {
    const value = metadata[key];
    if (isSafeAuditMetadataValue(value)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function participantRefForUserId(userId: string): string {
  return `participant:${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`;
}

export class AdminOperationsService {
  constructor(
    private readonly store: AdminOperationsStore,
    private readonly onlineCountReader: OnlineCountReader,
    private readonly challengeHealthChecker: ChallengeHealthChecker = defaultChallengeHealthChecker,
  ) {}

  async getSummary(now = new Date()): Promise<AdminOperationsSummary> {
    const [counts, onlineCount] = await Promise.all([
      this.store.getSummaryCounts(),
      this.onlineCountReader.getOnlineCount(),
    ]);

    return {
      onlineSessionCount: onlineCount.onlineSessionCount,
      ...counts,
      systemHealth: {
        backend: "ok",
        postgres: "ok",
        redis: onlineCount.source === "redis_presence" ? "ok" : "degraded",
        challengeServices: {
          ok: 8,
          degraded: 0,
          down: 0,
        },
      },
      generatedAt: now.toISOString(),
    };
  }

  listParticipants(page = 1, pageSize = 50): Promise<AdminListResponse<AdminParticipantListItem>> {
    return this.store.listParticipants({ page, pageSize, now: new Date() }).then((result) => ({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        registeredAt: item.registeredAt.toISOString(),
        lastSeenAt: item.lastSeenAt?.toISOString() ?? null,
        clearedAt: item.clearedAt?.toISOString() ?? null,
      })),
    }));
  }

  listSubmissions(page = 1, pageSize = 50): Promise<AdminListResponse<AdminSubmissionListItem>> {
    return this.store.listSubmissions({ page, pageSize }).then((result) => ({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    }));
  }

  listClears(page = 1, pageSize = 50): Promise<AdminListResponse<AdminClearListItem>> {
    return this.store.listClears({ page, pageSize }).then((result) => ({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        clearedAt: item.clearedAt.toISOString(),
      })),
    }));
  }

  listChallengeStatus(now = new Date()): Promise<AdminChallengeStatusItem[]> {
    return this.store.listChallengeStatus(now);
  }

  async getSystemHealth(now = new Date()): Promise<AdminSystemHealth> {
    const redisStart = Date.now();
    const [snapshotResult, onlineCountResult, challengeServices] = await Promise.allSettled([
      this.store.getSystemHealthSnapshot(),
      this.onlineCountReader.getOnlineCount(),
      Promise.all(CHALLENGE_HEALTH_ENDPOINTS.map((endpoint) => this.challengeHealthChecker.check(endpoint))),
    ]);
    const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
    const onlineCount = onlineCountResult.status === "fulfilled" ? onlineCountResult.value : null;

    return {
      backend: { status: "ok", checkedAt: now.toISOString() },
      postgres: {
        status: snapshot ? "ok" : "down",
        latencyMs: snapshot?.postgresLatencyMs ?? 0,
      },
      redis: {
        status: onlineCount ? (onlineCount.source === "redis_presence" ? "ok" : "degraded") : "down",
        latencyMs: elapsedMs(redisStart),
      },
      challengeServices:
        challengeServices.status === "fulfilled"
          ? challengeServices.value
          : CHALLENGE_HEALTH_ENDPOINTS.map((endpoint) => ({
              challengeId: endpoint.challengeId,
              status: "down",
              latencyMs: 0,
            })),
    };
  }

  listAuditLogs(page = 1, pageSize = 50): Promise<AdminListResponse<AdminAuditLogItem>> {
    return this.store.listAuditLogs({ page, pageSize }).then((result) => ({
      ...result,
      items: result.items.map((item) => ({
        id: item.id,
        actorRef: item.userId ? participantRefForUserId(item.userId) : null,
        action: item.action,
        metadata: sanitizeAuditMetadata(item.action, item.metadata),
        createdAt: item.createdAt.toISOString(),
      })),
    }));
  }
}
