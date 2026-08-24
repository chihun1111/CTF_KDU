import { and, eq } from "drizzle-orm";
import { challengeArtifacts, challengeFlags, challenges, claimTokens } from "@campus-ctf/db";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type { CachedChallengeArtifact, ChallengeArtifactStore } from "./challenge-artifact.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        where(condition: unknown): {
          limit(count: number): Promise<unknown[]>;
        };
        innerJoin(joinTable: unknown, condition: unknown): {
          where(condition: unknown): {
            limit(count: number): Promise<unknown[]>;
          };
        };
      };
    };
    insert(table: unknown): {
      values(value: unknown): Promise<unknown[]>;
    };
  };
};

function toFlagId(publicChallengeId: string): string | null {
  return /^[0-9]{2}$/.test(publicChallengeId) && /^[1-8]$/.test(publicChallengeId.slice(1))
    ? `FLAG-${publicChallengeId}`
    : null;
}

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

export class ChallengeArtifactDrizzleStore implements ChallengeArtifactStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async findArtifactForUser(input: {
    userId: string;
    publicChallengeId: string;
    artifactVersion: string;
  }): Promise<CachedChallengeArtifact | null> {
    const flagId = toFlagId(input.publicChallengeId);
    if (!flagId) {
      return null;
    }

    const rows = await this.database.db
      .select({
        artifactPath: challengeArtifacts.artifactPath,
        artifactHash: challengeArtifacts.artifactHash,
      })
      .from(challengeArtifacts)
      .innerJoin(challenges, eq(challengeArtifacts.challengeId, challenges.id))
      .where(
        and(
          eq(challengeArtifacts.userId, input.userId),
          eq(challengeArtifacts.artifactVersion, input.artifactVersion),
          eq(challenges.flagId, flagId),
          eq(challenges.isActive, true),
        ),
      )
      .limit(1);

    const [row] = rows as Array<{ artifactPath?: unknown; artifactHash?: unknown }>;
    if (typeof row?.artifactPath !== "string" || typeof row.artifactHash !== "string") {
      return null;
    }

    return {
      artifactPath: row.artifactPath,
      artifactHash: row.artifactHash,
    };
  }

  async findFlagForArtifact(input: {
    userId: string;
    publicChallengeId: string;
  }): Promise<{ flagCiphertext: EncryptedFieldBundle } | null> {
    const flagId = toFlagId(input.publicChallengeId);
    if (!flagId) {
      return null;
    }

    const rows = await this.database.db
      .select({
        flagCiphertext: challengeFlags.flagCiphertext,
      })
      .from(challengeFlags)
      .innerJoin(challenges, eq(challengeFlags.challengeId, challenges.id))
      .where(and(eq(challengeFlags.userId, input.userId), eq(challenges.flagId, flagId), eq(challenges.isActive, true)))
      .limit(1);

    const [row] = rows as Array<{ flagCiphertext?: unknown }>;
    if (!isEncryptedFieldBundle(row?.flagCiphertext)) {
      return null;
    }

    return {
      flagCiphertext: row.flagCiphertext,
    };
  }

  async createArtifactForUser(input: {
    userId: string;
    publicChallengeId: string;
    artifactVersion: string;
    artifactPath: string;
    artifactHash: string;
  }): Promise<void> {
    const challengeId = await this.findActiveChallengeId(input.publicChallengeId);
    if (!challengeId) {
      return;
    }

    await this.database.db.insert(challengeArtifacts).values({
      userId: input.userId,
      challengeId,
      artifactPath: input.artifactPath,
      artifactHash: input.artifactHash,
      artifactVersion: input.artifactVersion,
    });
  }

  async createClaimTokenForUser(input: {
    userId: string;
    publicChallengeId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    const challengeId = await this.findActiveChallengeId(input.publicChallengeId);
    if (!challengeId) {
      return;
    }

    await this.database.db.insert(claimTokens).values({
      userId: input.userId,
      challengeId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  private async findActiveChallengeId(publicChallengeId: string): Promise<string | null> {
    const flagId = toFlagId(publicChallengeId);
    if (!flagId) {
      return null;
    }

    const rows = await this.database.db
      .select({
        id: challenges.id,
      })
      .from(challenges)
      .where(and(eq(challenges.flagId, flagId), eq(challenges.isActive, true)))
      .limit(1);

    const [row] = rows as Array<{ id?: unknown }>;
    return typeof row?.id === "string" ? row.id : null;
  }
}
