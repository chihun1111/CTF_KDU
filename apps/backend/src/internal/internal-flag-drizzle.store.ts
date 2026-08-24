import { and, eq } from "drizzle-orm";
import { challengeFlags, challenges } from "@campus-ctf/db";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type { FlagId } from "../challenges/challenges.service.js";
import type { InternalFlagStore, UserChallengeFlagRecord } from "./internal-flag.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        where(condition: unknown): {
          limit(count: number): Promise<unknown[]>;
        };
      };
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

export class InternalFlagDrizzleStore implements InternalFlagStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async findUserChallengeFlag(userId: string, flagId: FlagId): Promise<UserChallengeFlagRecord | null> {
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

    const flagRows = await this.database.db
      .select({
        flagCiphertext: challengeFlags.flagCiphertext,
      })
      .from(challengeFlags)
      .where(and(eq(challengeFlags.userId, userId), eq(challengeFlags.challengeId, challenge.id)))
      .limit(1);

    const [flagRow] = flagRows as Array<{ flagCiphertext?: unknown }>;
    if (!isEncryptedFieldBundle(flagRow?.flagCiphertext)) {
      return null;
    }

    return {
      flagId,
      flagCiphertext: flagRow.flagCiphertext,
    };
  }
}
