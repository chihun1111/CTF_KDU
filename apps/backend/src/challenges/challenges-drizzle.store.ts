import { asc, desc, eq } from "drizzle-orm";
import { challengeSeedRows, challenges, finalSubmissionResults, finalSubmissions } from "@campus-ctf/db";
import type { ChallengeProgress, ChallengesStore, FlagId, PublicServiceRow } from "./challenges.service.js";

const REQUIRED_CHALLENGE_COUNT = challengeSeedRows.length;

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        where(condition: unknown): {
          orderBy(...columns: unknown[]): {
            limit(count: number): Promise<unknown[]>;
          };
          limit(count: number): Promise<unknown[]>;
        };
      };
    };
  };
};

function toProgressResultRows(rows: unknown[]): ChallengeProgress["resultsByFlagId"] {
  const resultsByFlagId: ChallengeProgress["resultsByFlagId"] = {};
  for (const row of rows as Array<{ flagId?: unknown; isCorrect?: unknown }>) {
    if (typeof row.flagId === "string" && typeof row.isCorrect === "boolean") {
      resultsByFlagId[row.flagId as FlagId] = { correct: row.isCorrect };
    }
  }

  return resultsByFlagId;
}

export class ChallengesDrizzleStore implements ChallengesStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async listActiveChallenges(): Promise<readonly PublicServiceRow[]> {
    const rows = await this.database.db
      .select({
        flagId: challenges.flagId,
      })
      .from(challenges)
      .where(eq(challenges.isActive, true))
      .orderBy(asc(challenges.flagId))
      .limit(REQUIRED_CHALLENGE_COUNT);

    return rows as PublicServiceRow[];
  }

  async getLatestProgress(userId: string): Promise<ChallengeProgress> {
    const submissions = await this.database.db
      .select({
        id: finalSubmissions.id,
        correctCount: finalSubmissions.correctCount,
        isClear: finalSubmissions.isClear,
      })
      .from(finalSubmissions)
      .where(eq(finalSubmissions.userId, userId))
      .orderBy(desc(finalSubmissions.createdAt))
      .limit(1);

    const [latest] = submissions as Array<{ id?: unknown; correctCount?: unknown; isClear?: unknown }>;
    if (typeof latest?.id !== "string") {
      return {
        correctCount: 0,
        requiredCount: REQUIRED_CHALLENGE_COUNT,
        cleared: false,
        resultsByFlagId: {},
      };
    }

    const resultRows = await this.database.db
      .select({
        flagId: finalSubmissionResults.flagId,
        isCorrect: finalSubmissionResults.isCorrect,
      })
      .from(finalSubmissionResults)
      .where(eq(finalSubmissionResults.finalSubmissionId, latest.id))
      .limit(REQUIRED_CHALLENGE_COUNT);

    return {
      correctCount: typeof latest.correctCount === "number" ? latest.correctCount : 0,
      requiredCount: REQUIRED_CHALLENGE_COUNT,
      cleared: latest.isClear === true,
      resultsByFlagId: toProgressResultRows(resultRows),
    };
  }
}
