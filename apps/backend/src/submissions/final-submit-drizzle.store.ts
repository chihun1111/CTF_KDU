import { eq } from "drizzle-orm";
import {
  challengeFlags,
  challenges,
  clears,
  clearViewTokens,
  finalSubmissionResults,
  finalSubmissions,
} from "@campus-ctf/db";
import type {
  FinalFlagId,
  FinalSubmitStore,
  FinalSubmitTransaction,
  UserChallengeFlagForSubmit,
} from "./final-submit.service.js";

type DatabaseClientLike = {
  db: {
    transaction<T>(callback: (tx: DrizzleTransactionLike) => Promise<T>): Promise<T>;
  };
};

type DrizzleTransactionLike = {
  select(selection?: unknown): {
    from(table: unknown): {
      innerJoin(joinTable: unknown, condition: unknown): {
        where(condition: unknown): {
          limit(count: number): Promise<unknown[]>;
        };
      };
    };
  };
  insert(table: unknown): {
    values(value: unknown): {
      returning?(selection?: unknown): Promise<unknown[]>;
      onConflictDoNothing?(input?: unknown): Promise<unknown[]>;
    };
  };
};

function firstId(rows: unknown[], context: string): { id: string } {
  const [row] = rows as Array<{ id?: unknown }>;
  if (typeof row?.id !== "string") {
    throw new Error(`${context} did not return an id`);
  }

  return { id: row.id };
}

export class FinalSubmitDrizzleStore implements FinalSubmitStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async transaction<T>(callback: (tx: FinalSubmitTransaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction((tx) => callback(new FinalSubmitDrizzleTransaction(tx)));
  }
}

class FinalSubmitDrizzleTransaction implements FinalSubmitTransaction {
  constructor(private readonly tx: DrizzleTransactionLike) {}

  async listUserChallengeFlags(userId: string): Promise<UserChallengeFlagForSubmit[]> {
    const rows = await this.tx
      .select({
        flagId: challenges.flagId,
        challengeId: challengeFlags.challengeId,
        flagHash: challengeFlags.flagHash,
      })
      .from(challengeFlags)
      .innerJoin(challenges, eq(challengeFlags.challengeId, challenges.id))
      .where(eq(challengeFlags.userId, userId))
      .limit(8);

    return rows as UserChallengeFlagForSubmit[];
  }

  async createFinalSubmission(input: Parameters<FinalSubmitTransaction["createFinalSubmission"]>[0]): Promise<{ id: string }> {
    const rows = await this.tx
      .insert(finalSubmissions)
      .values({
        userId: input.userId,
        submittedHashBundle: input.submittedHashBundle,
        correctCount: input.correctCount,
        isClear: input.isClear,
      })
      .returning?.({ id: finalSubmissions.id });

    return firstId(rows ?? [], "createFinalSubmission");
  }

  async createFinalSubmissionResults(input: Parameters<FinalSubmitTransaction["createFinalSubmissionResults"]>[0]): Promise<void> {
    await this.tx.insert(finalSubmissionResults).values(
      input.results.map((result) => ({
        finalSubmissionId: input.finalSubmissionId,
        userId: input.userId,
        flagId: result.flagId,
        challengeId: result.challengeId,
        submittedFlagHash: result.submittedFlagHash,
        isCorrect: result.isCorrect,
      })),
    );
  }

  async ensureClear(input: Parameters<FinalSubmitTransaction["ensureClear"]>[0]): Promise<void> {
    await this.tx
      .insert(clears)
      .values({
        userId: input.userId,
        clearReceiptCode: input.clearReceiptCode,
      })
      .onConflictDoNothing?.();
  }

  async createClearViewToken(input: Parameters<FinalSubmitTransaction["createClearViewToken"]>[0]): Promise<void> {
    await this.tx.insert(clearViewTokens).values({
      userId: input.userId,
      finalSubmissionId: input.finalSubmissionId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }
}
