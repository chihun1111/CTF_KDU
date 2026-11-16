import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  challengeSeedRows,
  challenges,
  clears,
  finalSubmissionResults,
  finalSubmissions,
  sessions,
  users,
} from "@campus-ctf/db";
import { createHash } from "node:crypto";
import type {
  AdminClearRow,
  AdminAuditLogRow,
  AdminChallengeStatusItem,
  AdminListResponse,
  AdminOperationsStore,
  AdminOperationsSummaryCounts,
  AdminParticipantRow,
  AdminSubmissionRow,
  AdminSystemHealthSnapshot,
} from "./admin-operations.service.js";
import { publicServiceHrefForFlagId } from "../challenges/challenges.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): any;
    execute(query: unknown): Promise<unknown>;
  };
};

function readCount(rows: unknown[]): number {
  const [row] = rows as Array<{ count?: unknown }>;
  const value = row?.count;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

function maskUserId(userId: string): string {
  return `participant:${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`;
}

function normalizePage(input: { page: number; pageSize: number }): { page: number; pageSize: number; offset: number } {
  const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const pageSize = [20, 50, 100].includes(input.pageSize) ? input.pageSize : 50;
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function toResultsBySubmission(rows: unknown[]): Map<string, Record<string, { correct: boolean }>> {
  const result = new Map<string, Record<string, { correct: boolean }>>();
  for (const row of rows as Array<{ finalSubmissionId?: unknown; flagId?: unknown; isCorrect?: unknown }>) {
    if (typeof row.finalSubmissionId !== "string" || typeof row.flagId !== "string" || typeof row.isCorrect !== "boolean") {
      continue;
    }
    const current = result.get(row.finalSubmissionId) ?? {};
    current[row.flagId] = { correct: row.isCorrect };
    result.set(row.finalSubmissionId, current);
  }
  return result;
}

export class AdminOperationsDrizzleStore implements AdminOperationsStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async getSummaryCounts(): Promise<AdminOperationsSummaryCounts> {
    const [
      registeredUserRows,
      submittedUserRows,
      clearedUserRows,
      finalSubmissionRows,
    ] = await Promise.all([
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, "participant")),
      this.database.db
        .select({ count: sql<number>`count(distinct ${finalSubmissions.userId})` })
        .from(finalSubmissions)
        .innerJoin(users, eq(finalSubmissions.userId, users.id))
        .where(eq(users.role, "participant")),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(clears)
        .innerJoin(users, eq(clears.userId, users.id))
        .where(eq(users.role, "participant")),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(finalSubmissions)
        .innerJoin(users, eq(finalSubmissions.userId, users.id))
        .where(eq(users.role, "participant")),
    ]);

    return {
      registeredUserCount: readCount(registeredUserRows),
      submittedUserCount: readCount(submittedUserRows),
      clearedUserCount: readCount(clearedUserRows),
      finalSubmissionCount: readCount(finalSubmissionRows),
    };
  }

  async listParticipants(input: { page: number; pageSize: number; now: Date }): Promise<AdminListResponse<AdminParticipantRow>> {
    const { page, pageSize, offset } = normalizePage(input);
    const onlineSince = new Date(input.now.getTime() - 120 * 1000);
    // A nested SQL fragment preserves the outer table qualifier in Drizzle's
    // single-table projection, so each subquery correlates with users.id.
    const participantUserId = sql`${users.id}`;
    // Correlated aggregates operate on the displayed participants. Global row
    // cutoffs made quieter users disappear once other participants submitted often.
    const [participantRows, totalRows] = await Promise.all([
      this.database.db
        .select({
          userId: users.id,
          role: users.role,
          registeredAt: users.createdAt,
          latestCorrectCount: sql<number>`coalesce((
            select ${finalSubmissions.correctCount} from ${finalSubmissions}
            where ${finalSubmissions.userId} = ${participantUserId}
            order by ${finalSubmissions.createdAt} desc, ${finalSubmissions.id} desc limit 1
          ), 0)`.mapWith(Number),
          finalSubmissionCount: sql<number>`(
            select count(*) from ${finalSubmissions} where ${finalSubmissions.userId} = ${participantUserId}
          )`.mapWith(Number),
          lastSeenAt: sql<Date | null>`(
            select max(${sessions.lastSeenAt}) from ${sessions}
            where ${sessions.userId} = ${participantUserId}
              and ${sessions.lastSeenAt} >= ${onlineSince.toISOString()}
              and ${sessions.expiresAt} > ${input.now.toISOString()}
              and ${sessions.revokedAt} is null
          )`.mapWith(sessions.lastSeenAt),
          clearedAt: sql<Date | null>`(
            select ${clears.clearedAt} from ${clears} where ${clears.userId} = ${participantUserId}
          )`.mapWith(clears.clearedAt),
        })
        .from(users)
        .where(eq(users.role, "participant"))
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(pageSize)
        .offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "participant")),
    ]);

    return {
      items: (participantRows as Array<{
        userId: string;
        role: "participant" | "admin";
        registeredAt: Date;
        latestCorrectCount: number;
        finalSubmissionCount: number;
        lastSeenAt: Date | null;
        clearedAt: Date | null;
      }>).map((row) => ({
        participantRef: maskUserId(row.userId),
        role: row.role,
        registeredAt: row.registeredAt,
        lastSeenAt: row.lastSeenAt ?? null,
        online: Boolean(row.lastSeenAt),
        latestCorrectCount: row.latestCorrectCount ?? 0,
        requiredCount: 8,
        cleared: Boolean(row.clearedAt),
        clearedAt: row.clearedAt ?? null,
        finalSubmissionCount: row.finalSubmissionCount ?? 0,
      })),
      page,
      pageSize,
      totalCount: readCount(totalRows),
    };
  }

  async listSubmissions(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminSubmissionRow>> {
    const { page, pageSize, offset } = normalizePage(input);
    const [submissionRows, totalRows] = await Promise.all([
      this.database.db
        .select({
          id: finalSubmissions.id,
          userId: finalSubmissions.userId,
          correctCount: finalSubmissions.correctCount,
          isClear: finalSubmissions.isClear,
          createdAt: finalSubmissions.createdAt,
        })
        .from(finalSubmissions)
        .innerJoin(users, eq(finalSubmissions.userId, users.id))
        .where(eq(users.role, "participant"))
        .orderBy(desc(finalSubmissions.createdAt), desc(finalSubmissions.id))
        .limit(pageSize)
        .offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(finalSubmissions)
        .innerJoin(users, eq(finalSubmissions.userId, users.id)).where(eq(users.role, "participant")),
    ]);
    const submissionIds = (submissionRows as Array<{ id: string }>).map((row) => row.id);
    const resultRows = submissionIds.length === 0
      ? []
      : await this.database.db
        .select({
          finalSubmissionId: finalSubmissionResults.finalSubmissionId,
          flagId: finalSubmissionResults.flagId,
          isCorrect: finalSubmissionResults.isCorrect,
        })
        .from(finalSubmissionResults)
        .where(inArray(finalSubmissionResults.finalSubmissionId, submissionIds));
    const resultsBySubmission = toResultsBySubmission(resultRows);

    return {
      items: (submissionRows as Array<{
        id: string;
        userId: string;
        correctCount: number;
        isClear: boolean;
        createdAt: Date;
      }>).map((row) => ({
        id: row.id,
        participantRef: maskUserId(row.userId),
        correctCount: row.correctCount,
        requiredCount: 8,
        isClear: row.isClear,
        resultsByFlagId: resultsBySubmission.get(row.id) ?? {},
        createdAt: row.createdAt,
      })),
      page,
      pageSize,
      totalCount: readCount(totalRows),
    };
  }

  async listClears(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminClearRow>> {
    const { page, pageSize, offset } = normalizePage(input);
    const [clearRows, totalRows] = await Promise.all([
      this.database.db
        .select({
          userId: clears.userId,
          clearedAt: clears.clearedAt,
        })
        .from(clears)
        .innerJoin(users, eq(clears.userId, users.id))
        .where(eq(users.role, "participant"))
        .orderBy(desc(clears.clearedAt), desc(clears.id))
        .limit(pageSize)
        .offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(clears)
        .innerJoin(users, eq(clears.userId, users.id)).where(eq(users.role, "participant")),
    ]);

    return {
      items: (clearRows as Array<{ userId: string; clearedAt: Date }>).map((row) => ({
        participantRef: maskUserId(row.userId),
        clearedAt: row.clearedAt,
      })),
      page,
      pageSize,
      totalCount: readCount(totalRows),
    };
  }

  async listChallengeStatus(now: Date): Promise<AdminChallengeStatusItem[]> {
    const [challengeRows, solvedRows] = await Promise.all([
      this.database.db
        .select({
          id: challenges.id,
          flagId: challenges.flagId,
          title: challenges.title,
          isActive: challenges.isActive,
        })
        .from(challenges)
        .where(inArray(challenges.flagId, challengeSeedRows.map((seed) => seed.flagId)))
        .orderBy(challenges.flagId)
        .limit(8),
      this.database.db
        .select({
          flagId: finalSubmissionResults.flagId,
          count: sql<number>`count(distinct ${finalSubmissionResults.userId})`.mapWith(Number),
        })
        .from(finalSubmissionResults)
        .innerJoin(users, eq(finalSubmissionResults.userId, users.id))
        .where(and(eq(finalSubmissionResults.isCorrect, true), eq(users.role, "participant")))
        .groupBy(finalSubmissionResults.flagId),
    ]);
    const solvedByFlag = new Map((solvedRows as Array<{ flagId: string; count: number }>).map((row) => [row.flagId, row.count]));
    const challengeByFlag = new Map(
      (challengeRows as Array<{ id: string; flagId: string; title: string; isActive: boolean }>).map((row) => [row.flagId, row]),
    );

    return challengeSeedRows.map((seed) => {
      const challenge = challengeByFlag.get(seed.flagId);
      const challengeId = seed.flagId.slice(-2);
      return {
        challengeId,
        flagId: seed.flagId,
        title: challenge?.title ?? seed.title,
        servicePath: publicServiceHrefForFlagId(seed.flagId),
        health: "ok",
        visible: challenge?.isActive ?? false,
        solvedCount: solvedByFlag.get(seed.flagId) ?? 0,
        lastHealthcheckAt: now.toISOString(),
      };
    });
  }

  async listAuditLogs(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminAuditLogRow>> {
    const { page, pageSize, offset } = normalizePage(input);
    const whereClause = sql`true`;
    const [rows, totalRows] = await Promise.all([
      this.database.db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          action: auditLogs.action,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(pageSize)
        .offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(whereClause),
    ]);

    return {
      items: (rows as Array<{
        id: string;
        userId: string | null;
        action: string;
        metadata: unknown;
        createdAt: Date;
      }>).map((row) => ({
        id: row.id,
        userId: row.userId,
        action: row.action,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
      page,
      pageSize,
      totalCount: readCount(totalRows),
    };
  }

  async getSystemHealthSnapshot(): Promise<AdminSystemHealthSnapshot> {
    const start = Date.now();
    const result = await this.database.db.execute(sql`select 1 as ok`);
    const ping = (result as { rows?: Array<{ ok?: unknown }> })?.rows?.[0];
    if (ping?.ok !== 1) {
      throw new Error("Postgres health query failed");
    }

    return {
      postgresLatencyMs: Math.max(0, Date.now() - start),
    };
  }
}
