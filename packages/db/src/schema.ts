import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const challengeDifficulty = pgEnum("challenge_difficulty", ["하", "중", "중상"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentIdCiphertext: jsonb("student_id_ciphertext").notNull().$type<Record<string, unknown>>(),
    studentIdKeyVersion: text("student_id_key_version").notNull(),
    studentIdHash: text("student_id_hash").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("participant"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_student_id_hash_key").on(table.studentIdHash)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionHash: text("session_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_session_hash_key").on(table.sessionHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const cookieConsents = pgTable("cookie_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  consentVersion: text("consent_version").notNull(),
  requiredLoggingAccepted: boolean("required_logging_accepted").notNull(),
  analyticsLoggingAccepted: boolean("analytics_logging_accepted"),
  cookieAccepted: boolean("cookie_accepted").notNull(),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    flagId: text("flag_id").notNull(),
    title: text("title").notNull(),
    difficulty: challengeDifficulty("difficulty").notNull(),
    category: text("category").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("challenges_flag_id_key").on(table.flagId)],
);

export const challengeFlags = pgTable(
  "challenge_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id),
    flagCiphertext: jsonb("flag_ciphertext").notNull().$type<Record<string, unknown>>(),
    flagKeyVersion: text("flag_key_version").notNull(),
    flagHash: text("flag_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("challenge_flags_user_challenge_key").on(table.userId, table.challengeId),
    uniqueIndex("challenge_flags_user_flag_hash_key").on(table.userId, table.flagHash),
  ],
);

export const challengeArtifacts = pgTable("challenge_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id),
  artifactPath: text("artifact_path").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  artifactVersion: text("artifact_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimTokens = pgTable("claim_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const finalSubmissions = pgTable("final_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  submittedHashBundle: jsonb("submitted_hash_bundle").notNull().$type<unknown>(),
  correctCount: integer("correct_count").notNull(),
  isClear: boolean("is_clear").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("final_submissions_user_latest_idx").on(table.userId, table.createdAt.desc(), table.id.desc())]);

export const finalSubmissionResults = pgTable("final_submission_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  finalSubmissionId: uuid("final_submission_id")
    .notNull()
    .references(() => finalSubmissions.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  flagId: text("flag_id").notNull(),
  challengeId: text("challenge_id").notNull(),
  submittedFlagHash: text("submitted_flag_hash"),
  isCorrect: boolean("is_correct").notNull(),
}, (table) => [
  index("final_submission_results_submission_idx").on(table.finalSubmissionId),
  index("final_submission_results_solved_idx").on(table.flagId, table.userId).where(sql`${table.isCorrect} = true`),
]);

export const clears = pgTable(
  "clears",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    clearReceiptCode: text("clear_receipt_code").notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clears_user_id_key").on(table.userId)],
);

export const clearViewTokens = pgTable("clear_view_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  finalSubmissionId: uuid("final_submission_id")
    .notNull()
    .references(() => finalSubmissions.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schemaTables = {
  users,
  sessions,
  cookieConsents,
  challenges,
  challengeFlags,
  challengeArtifacts,
  claimTokens,
  finalSubmissions,
  finalSubmissionResults,
  clears,
  clearViewTokens,
  auditLogs,
};

export type ChallengeSeedRow = {
  flagId: string;
  title: string;
  difficulty: "하" | "중" | "중상";
  category: string;
};

export const challengeSeedRows: readonly ChallengeSeedRow[] = [
  { flagId: "FLAG-01", title: "캠퍼스 축제 안내", difficulty: "하", category: "Web / Misc" },
  { flagId: "FLAG-02", title: "서비스 상태", difficulty: "하", category: "Web" },
  { flagId: "FLAG-03", title: "과제 제출 확인", difficulty: "중", category: "Web" },
  { flagId: "FLAG-04", title: "동아리 운영 현황", difficulty: "중", category: "Web" },
  { flagId: "FLAG-05", title: "동아리 홍보 페이지", difficulty: "중", category: "Frontend" },
  { flagId: "FLAG-06", title: "빌드 자료 보관함", difficulty: "중", category: "Frontend" },
  { flagId: "FLAG-07", title: "자유게시판 검색", difficulty: "중상", category: "Web / DB" },
  { flagId: "FLAG-08", title: "특별상 수령 안내", difficulty: "중상", category: "Web / Crypto" },
];
