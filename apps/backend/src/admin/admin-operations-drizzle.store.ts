import { and, desc, eq, gte, sql } from "drizzle-orm";
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

function latestByUser<T extends { userId: string }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!result.has(row.userId)) {
      result.set(row.userId, row);
    }
  }
  return result;
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
        .where(sql`true`),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(clears)
        .where(sql`true`),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(finalSubmissions)
        .where(sql`true`),
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
    const [participantRows, totalRows, latestSubmissionRows, clearRows, sessionRows, submissionCountRows] = await Promise.all([
      this.database.db
        .select({
          userId: users.id,
          role: users.role,
          registeredAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.role, "participant"))
        .orderBy?.(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset) ?? Promise.resolve([]),
      this.database.db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "participant")),
      this.database.db
        .select({
          userId: finalSubmissions.userId,
          correctCount: finalSubmissions.correctCount,
          isClear: finalSubmissions.isClear,
          createdAt: finalSubmissions.createdAt,
        })
        .from(finalSubmissions)
        .where(sql`true`)
        .orderBy?.(desc(finalSubmissions.createdAt))
        .limit(1000)
        .offset(0) ?? Promise.resolve([]),
      this.database.db
        .select({
          userId: clears.userId,
          clearedAt: clears.clearedAt,
        })
        .from(clears)
        .where(sql`true`),
      this.database.db
        .select({
          userId: sessions.userId,
          lastSeenAt: sessions.lastSeenAt,
        })
        .from(sessions)
        .where(and(gte(sessions.lastSeenAt, onlineSince), gte(sessions.expiresAt, input.now), sql`${sessions.revokedAt} is null`))
        .orderBy(desc(sessions.lastSeenAt))
        .limit(5000),
      this.database.db
        .select({
          userId: finalSubmissions.userId,
        })
        .from(finalSubmissions)
        .where(sql`true`)
        .limit(5000),
    ]);
    const latestSubmissionByUser = latestByUser(
      latestSubmissionRows as Array<{ userId: string; correctCount: number; isClear: boolean; createdAt: Date }>,
    );
    const clearByUser = new Map((clearRows as Array<{ userId: string; clearedAt: Date }>).map((row) => [row.userId, row]));
    const sessionByUser = new Map((sessionRows as Array<{ userId: string; lastSeenAt: Date }>).map((row) => [row.userId, row]));
    const submissionCountByUser = new Map<string, number>();
    for (const row of submissionCountRows as Array<{ userId?: unknown }>) {
      if (typeof row.userId === "string") {
        submissionCountByUser.set(row.userId, (submissionCountByUser.get(row.userId) ?? 0) + 1);
      }
    }

    return {
      items: (participantRows as Array<{
        userId: string;
        role: "participant" | "admin";
        registeredAt: Date;
      }>).map((row) => {
        const latest = latestSubmissionByUser.get(row.userId);
        const clear = clearByUser.get(row.userId);
        const session = sessionByUser.get(row.userId);
        return {
          participantRef: maskUserId(row.userId),
          role: row.role,
          registeredAt: row.registeredAt,
          lastSeenAt: session?.lastSeenAt ?? null,
          online: Boolean(session),
          latestCorrectCount: latest?.correctCount ?? 0,
          requiredCount: 8,
          cleared: Boolean(clear ?? latest?.isClear),
          clearedAt: clear?.clearedAt ?? null,
          finalSubmissionCount: submissionCountByUser.get(row.userId) ?? 0,
        };
      }),
      page,
      pageSize,
      totalCount: readCount(totalRows),
    };
  }

  async listSubmissions(input: { page: number; pageSize: number }): Promise<AdminListResponse<AdminSubmissionRow>> {
    const { page, pageSize, offset } = normalizePage(input);
    const [submissionRows, totalRows, resultRows] = await Promise.all([
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
        .where(sql`true`)
        .orderBy?.(desc(finalSubmissions.createdAt))
        .limit(pageSize)
        .offset(offset) ?? Promise.resolve([]),
      this.database.db.select({ count: sql<number>`count(*)` }).from(finalSubmissions).where(sql`true`),
      this.database.db
        .select({
          finalSubmissionId: finalSubmissionResults.finalSubmissionId,
          flagId: finalSubmissionResults.flagId,
          isCorrect: finalSubmissionResults.isCorrect,
        })
        .from(finalSubmissionResults)
        .where(sql`true`),
    ]);
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
        .where(sql`true`)
        .orderBy?.(desc(clears.clearedAt))
        .limit(pageSize)
        .offset(offset) ?? Promise.resolve([]),
      this.database.db.select({ count: sql<number>`count(*)` }).from(clears).where(sql`true`),
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
        .where(sql`true`)
        .orderBy(challenges.flagId)
        .limit(8),
      this.database.db
        .select({
          flagId: finalSubmissionResults.flagId,
          userId: finalSubmissionResults.userId,
        })
        .from(finalSubmissionResults)
        .where(eq(finalSubmissionResults.isCorrect, true))
        .limit(5000),
    ]);
    const solvedByFlag = new Map<string, Set<string>>();
    for (const row of solvedRows as Array<{ flagId?: unknown; userId?: unknown }>) {
      if (typeof row.flagId === "string" && typeof row.userId === "string") {
        const usersForFlag = solvedByFlag.get(row.flagId) ?? new Set<string>();
        usersForFlag.add(row.userId);
        solvedByFlag.set(row.flagId, usersForFlag);
      }
    }
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
        visible: challenge?.isActive ?? true,
        solvedCount: solvedByFlag.get(seed.flagId)?.size ?? 0,
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
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(whereClause),
    ]);

    return {
      items: (rows as Array<{
        id: string;
        userId: string | null;
        action: string;
        metadata: Record<string, unknown>;
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
    const pingRows = await this.database.db.select({ count: sql<number>`count(*)` }).from(users).where(sql`true`);

    const [ping] = pingRows as Array<{ count?: unknown }>;
    if (ping?.count === undefined) {
      throw new Error("Postgres health query failed");
    }

    return {
      postgresLatencyMs: Math.max(0, Date.now() - start),
    };
  }
}
