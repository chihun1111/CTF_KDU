import { and, eq, gt } from "drizzle-orm";
import { challengeFlags, challenges, claimTokens } from "@campus-ctf/db";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type { InternalClaimLookup, InternalClaimRecord, InternalClaimStore } from "./internal-claim.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        where(condition: unknown): {
          limit(count: number): Promise<unknown[]>;
        };
      };
    };
    insert(table: unknown): {
      values(value: unknown): Promise<unknown[]>;
    };
  };
};

function isEncryptedFieldBundle(value: unknown): value is EncryptedFieldBundle {
  const bundle = value as Partial<EncryptedFieldBundle> | undefined;
  return (
    bundle?.alg === "AES-256-GCM" &&
    typeof bundle.keyVersion === "string" &&
    typeof bundle.iv === "string" &&
    typeof bundle.ciphertext === "string" &&
    typeof bundle.tag === "string"
  );
}

export class InternalClaimDrizzleStore implements InternalClaimStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async findValidClaim(input: InternalClaimLookup): Promise<InternalClaimRecord | null> {
    const challenge = await this.findActiveChallenge(input.flagId);
    if (!challenge) {
      return null;
    }

    const claimRows = await this.database.db
      .select({ claimId: claimTokens.id })
      .from(claimTokens)
      .where(
        and(
          eq(claimTokens.userId, input.userId),
          eq(claimTokens.challengeId, challenge.id),
          eq(claimTokens.tokenHash, input.tokenHash),
          gt(claimTokens.expiresAt, input.now),
        ),
      )
      .limit(1);

    const [claim] = claimRows as Array<{ claimId?: unknown }>;
    if (typeof claim?.claimId !== "string") {
      return null;
    }

    const flagRows = await this.database.db
      .select({ flagCiphertext: challengeFlags.flagCiphertext })
      .from(challengeFlags)
      .where(and(eq(challengeFlags.userId, input.userId), eq(challengeFlags.challengeId, challenge.id)))
      .limit(1);

    const [flagRow] = flagRows as Array<{ flagCiphertext?: unknown }>;
    if (!isEncryptedFieldBundle(flagRow?.flagCiphertext)) {
      return null;
    }

    return {
      flagId: input.flagId,
      flagCiphertext: flagRow.flagCiphertext,
    };
  }

  async createClaimToken(input: { userId: string; flagId: InternalClaimLookup["flagId"]; tokenHash: string; expiresAt: Date }): Promise<void> {
    const challenge = await this.findActiveChallenge(input.flagId);
    if (!challenge) {
      return;
    }

    await this.database.db.insert(claimTokens).values({
      userId: input.userId,
      challengeId: challenge.id,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  private async findActiveChallenge(flagId: InternalClaimLookup["flagId"]): Promise<{ id: string } | null> {
    const challengeRows = await this.database.db
      .select({
        id: challenges.id,
        flagId: challenges.flagId,
      })
      .from(challenges)
      .where(and(eq(challenges.flagId, flagId), eq(challenges.isActive, true)))
      .limit(1);

    const [challenge] = challengeRows as Array<{ id?: unknown; flagId?: unknown }>;
    if (typeof challenge?.id !== "string" || challenge.flagId !== flagId) {
      return null;
    }

    return {
      id: challenge.id,
    };
  }
}
