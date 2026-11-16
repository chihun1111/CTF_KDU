import type { PublicService } from "@campus-ctf/shared";
export type { PublicService, ChallengeDifficulty, ChallengeDifficultyLevel } from "@campus-ctf/shared";

export const FLAG_IDS = [
  "FLAG-01",
  "FLAG-02",
  "FLAG-03",
  "FLAG-04",
  "FLAG-05",
  "FLAG-06",
  "FLAG-07",
  "FLAG-08",
] as const;

export type FlagId = (typeof FLAG_IDS)[number];

export type SessionState =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      role: "participant" | "admin";
    };

export type ChallengeProgress = {
  correctCount: number;
  requiredCount: number;
  cleared: boolean;
  resultsByFlagId: Partial<Record<FlagId, { correct: boolean }>>;
};

export type ServiceHub = {
  services: PublicService[];
};

export type FinalSubmitResult = {
  cleared: boolean;
  correctCount: number;
  requiredCount: number;
  resultsByFlagId: Partial<Record<FlagId, { correct: boolean }>>;
  message: string;
  clearRedirectTo?: "/clear";
};

export type ClearCertificate = {
  studentId: string;
  clearedAt: string;
  clearReceiptCode: string;
  message: string;
};

export type OnlineSessionCount = {
  onlineSessionCount: number;
  source: "redis_presence" | "db_last_seen_fallback";
  windowSeconds: 90 | 120;
  generatedAt: string;
};

export type AdminOperationsSummary = {
  onlineSessionCount: number;
  registeredUserCount: number;
  submittedUserCount: number;
  clearedUserCount: number;
  finalSubmissionCount: number;
  systemHealth: {
    backend: "ok" | "degraded" | "down";
    postgres: "ok" | "degraded" | "down";
    redis: "ok" | "degraded" | "down";
    challengeServices: {
      ok: number;
      degraded: number;
      down: number;
    };
  };
  generatedAt: string;
};

export type AdminListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};

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
  resultsByFlagId: Partial<Record<FlagId, { correct: boolean }>>;
  createdAt: string;
};

export type AdminClearListItem = {
  participantRef: string;
  clearedAt: string;
};

export type AdminChallengeStatusItem = {
  challengeId: string;
  flagId: FlagId;
  title: string;
  servicePath: string;
  health: "ok" | "degraded" | "down";
  visible: boolean;
  solvedCount: number;
  lastHealthcheckAt: string;
};

export type AdminSystemHealth = {
  backend: { status: "ok" | "degraded" | "down"; checkedAt: string };
  postgres: { status: "ok" | "degraded" | "down"; latencyMs: number };
  redis: { status: "ok" | "degraded" | "down"; latencyMs: number };
  challengeServices: Array<{ challengeId: string; status: "ok" | "degraded" | "down"; latencyMs: number }>;
};

export type AdminAuditLogItem = {
  id: string;
  actorRef: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type HintStageKey = "first" | "second" | "extra";

export type PublicHintStage = {
  stageId: string;
  key: HintStageKey;
  label: string;
  releaseTiming: string;
  released: boolean;
  releasedAt?: string;
  text?: string;
};

export type PublicHintChallenge = {
  number: string;
  title: string;
  stages: PublicHintStage[];
};

export type PublicHintsResponse = {
  generatedAt: string;
  challenges: PublicHintChallenge[];
};

export type AdminHintStage = PublicHintStage & {
  text: string;
};

export type AdminHintChallenge = {
  number: string;
  title: string;
  stages: AdminHintStage[];
};

export type AdminHintsResponse = {
  generatedAt: string;
  totalStageCount: number;
  releasedStageCount: number;
  challenges: AdminHintChallenge[];
};

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
