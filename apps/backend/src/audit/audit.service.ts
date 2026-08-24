export const AUDIT_ACTIONS = {
  FINAL_SUBMIT: "FINAL_SUBMIT",
  ARTIFACT_GENERATION_FAILED: "ARTIFACT_GENERATION_FAILED",
  CLAIM_VERIFY_FAILED: "CLAIM_VERIFY_FAILED",
  ADMIN_SUMMARY_VIEWED: "ADMIN_SUMMARY_VIEWED",
  ADMIN_ONLINE_COUNT_VIEWED: "ADMIN_ONLINE_COUNT_VIEWED",
  ADMIN_PARTICIPANTS_VIEWED: "ADMIN_PARTICIPANTS_VIEWED",
  ADMIN_PARTICIPANT_DETAIL_VIEWED: "ADMIN_PARTICIPANT_DETAIL_VIEWED",
  ADMIN_SUBMISSIONS_VIEWED: "ADMIN_SUBMISSIONS_VIEWED",
  ADMIN_CLEARS_VIEWED: "ADMIN_CLEARS_VIEWED",
  ADMIN_CHALLENGE_STATUS_VIEWED: "ADMIN_CHALLENGE_STATUS_VIEWED",
  ADMIN_SYSTEM_HEALTH_VIEWED: "ADMIN_SYSTEM_HEALTH_VIEWED",
  ADMIN_AUDIT_LOGS_VIEWED: "ADMIN_AUDIT_LOGS_VIEWED",
  ADMIN_HINTS_VIEWED: "ADMIN_HINTS_VIEWED",
  ADMIN_HINT_STAGE_RELEASED: "ADMIN_HINT_STAGE_RELEASED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const REQUIRED_OPERATIONS_LOG_CATEGORY = "required_operations";

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditStore = {
  createAuditLog(input: { userId: string | null; action: AuditAction; metadata: AuditMetadata }): Promise<void>;
};

export type AdminReadAuditInput = {
  adminUserId: string;
  resource:
    | "operations.summary"
    | "operations.online-count"
    | "participants"
    | "submissions"
    | "clears"
    | "challenges.status"
    | "system.health"
    | "audit-logs"
    | "hints";
  page?: number;
  pageSize?: number;
  unsafeMetadata?: Record<string, unknown>;
};

export type ClaimVerifyFailureAuditInput = {
  userId: string;
  challengeId?: string;
  flagId?: string;
  reason: "invalid_input" | "not_found";
};

export type ArtifactGenerationFailureAuditInput = {
  userId: string;
  challengeId: string;
  reason: "missing_flag" | "generate_failed" | "write_failed" | "read_failed";
};

export type OnlineCountAuditInput = {
  adminUserId: string;
  onlineSessionCount: number;
  source: "redis_presence" | "db_last_seen_fallback";
  windowSeconds: number;
  generatedAt: string;
  unsafeMetadata?: Record<string, unknown>;
};

export type AdminHintStageReleaseAuditInput = {
  adminUserId: string;
  stageId: string;
  challengeNumber: string;
  stageKey: "first" | "second" | "extra";
  unsafeMetadata?: Record<string, unknown>;
};

export type FinalSubmitAuditInput = {
  userId: string;
  correctCount: number;
  requiredCount: number;
  submittedCount: number;
  cleared: boolean;
};

const ADMIN_READ_ACTION_BY_RESOURCE: Record<AdminReadAuditInput["resource"], AuditAction> = {
  "operations.summary": AUDIT_ACTIONS.ADMIN_SUMMARY_VIEWED,
  "operations.online-count": AUDIT_ACTIONS.ADMIN_ONLINE_COUNT_VIEWED,
  participants: AUDIT_ACTIONS.ADMIN_PARTICIPANTS_VIEWED,
  submissions: AUDIT_ACTIONS.ADMIN_SUBMISSIONS_VIEWED,
  clears: AUDIT_ACTIONS.ADMIN_CLEARS_VIEWED,
  "challenges.status": AUDIT_ACTIONS.ADMIN_CHALLENGE_STATUS_VIEWED,
  "system.health": AUDIT_ACTIONS.ADMIN_SYSTEM_HEALTH_VIEWED,
  "audit-logs": AUDIT_ACTIONS.ADMIN_AUDIT_LOGS_VIEWED,
  hints: AUDIT_ACTIONS.ADMIN_HINTS_VIEWED,
};

function safeString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length > 128 ? value.slice(0, 128) : value;
}

export class AuditService {
  constructor(private readonly store: AuditStore) {}

  recordFinalSubmit(input: FinalSubmitAuditInput): Promise<void> {
    return this.store.createAuditLog({
      userId: input.userId,
      action: AUDIT_ACTIONS.FINAL_SUBMIT,
      metadata: {
        logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
        correctCount: input.correctCount,
        requiredCount: input.requiredCount,
        submittedCount: input.submittedCount,
        cleared: input.cleared,
      },
    });
  }

  recordArtifactGenerationFailure(input: ArtifactGenerationFailureAuditInput): Promise<void> {
    return this.store.createAuditLog({
      userId: input.userId,
      action: AUDIT_ACTIONS.ARTIFACT_GENERATION_FAILED,
      metadata: {
        logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
        challengeId: safeString(input.challengeId) ?? "unknown",
        reason: input.reason,
      },
    });
  }

  recordClaimVerifyFailure(input: ClaimVerifyFailureAuditInput): Promise<void> {
    const metadata: AuditMetadata = {
      logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
      reason: input.reason,
    };
    const challengeId = safeString(input.challengeId);
    const flagId = safeString(input.flagId);
    if (challengeId) {
      metadata.challengeId = challengeId;
    }
    if (flagId) {
      metadata.flagId = flagId;
    }

    return this.store.createAuditLog({
      userId: input.userId,
      action: AUDIT_ACTIONS.CLAIM_VERIFY_FAILED,
      metadata,
    });
  }

  recordAdminRead(input: AdminReadAuditInput): Promise<void> {
    const metadata: AuditMetadata = {
      logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
      resource: input.resource,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 50,
    };
    return this.store.createAuditLog({
      userId: input.adminUserId,
      action: ADMIN_READ_ACTION_BY_RESOURCE[input.resource],
      metadata,
    });
  }

  recordOnlineCountRead(input: OnlineCountAuditInput): Promise<void> {
    return this.store.createAuditLog({
      userId: input.adminUserId,
      action: AUDIT_ACTIONS.ADMIN_ONLINE_COUNT_VIEWED,
      metadata: {
        logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
        resource: "operations.online-count",
        onlineSessionCount: input.onlineSessionCount,
        source: input.source,
        windowSeconds: input.windowSeconds,
        generatedAt: input.generatedAt,
      },
    });
  }

  recordAdminHintStageRelease(input: AdminHintStageReleaseAuditInput): Promise<void> {
    return this.store.createAuditLog({
      userId: input.adminUserId,
      action: AUDIT_ACTIONS.ADMIN_HINT_STAGE_RELEASED,
      metadata: {
        logCategory: REQUIRED_OPERATIONS_LOG_CATEGORY,
        resource: "hints",
        stageId: safeString(input.stageId) ?? "unknown",
        challengeNumber: safeString(input.challengeNumber) ?? "unknown",
        stageKey: input.stageKey,
      },
    });
  }
}
