import { and, eq, gt, isNull } from "drizzle-orm";
import { clearViewTokens, clears, finalSubmissions, users } from "@campus-ctf/db";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type {
  ClearCertificateRecord,
  ClearCertificateStore,
  ConsumeClearViewTokenInput,
} from "./clear-certificate.service.js";

type DatabaseClientLike = {
  db: {
    transaction<T>(callback: (tx: DrizzleTransactionLike) => Promise<T>): Promise<T>;
  };
};

type DrizzleTransactionLike = {
  select(selection?: unknown): {
    from(table: unknown): {
      innerJoin(joinTable: unknown, condition: unknown): {
        innerJoin(secondJoinTable: unknown, secondCondition: unknown): {
          innerJoin(thirdJoinTable: unknown, thirdCondition: unknown): {
            where(condition: unknown): {
              limit(count: number): Promise<unknown[]>;
            };
          };
        };
      };
    };
  };
  update(table: unknown): {
    set(value: unknown): {
      where(condition: unknown): {
        returning(selection?: unknown): Promise<unknown[]>;
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

export class ClearCertificateDrizzleStore implements ClearCertificateStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async consumeClearViewToken(input: ConsumeClearViewTokenInput): Promise<ClearCertificateRecord | null> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          clearViewTokenId: clearViewTokens.id,
          studentIdCiphertext: users.studentIdCiphertext,
          clearedAt: clears.clearedAt,
          clearReceiptCode: clears.clearReceiptCode,
        })
        .from(clearViewTokens)
        .innerJoin(
          finalSubmissions,
          and(
            eq(clearViewTokens.finalSubmissionId, finalSubmissions.id),
            eq(clearViewTokens.userId, finalSubmissions.userId),
            eq(finalSubmissions.isClear, true),
          ),
        )
        .innerJoin(clears, eq(clearViewTokens.userId, clears.userId))
        .innerJoin(users, eq(clearViewTokens.userId, users.id))
        .where(
          and(
            eq(clearViewTokens.userId, input.userId),
            eq(clearViewTokens.tokenHash, input.tokenHash),
            gt(clearViewTokens.expiresAt, input.now),
            isNull(clearViewTokens.consumedAt),
          ),
        )
        .limit(1);

      const [row] = rows as Array<{
        clearViewTokenId?: unknown;
        studentIdCiphertext?: unknown;
        clearedAt?: unknown;
        clearReceiptCode?: unknown;
      }>;
      if (
        typeof row?.clearViewTokenId !== "string" ||
        !isEncryptedFieldBundle(row.studentIdCiphertext) ||
        !(row.clearedAt instanceof Date) ||
        typeof row.clearReceiptCode !== "string"
      ) {
        return null;
      }

      const consumedRows = await tx
        .update(clearViewTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(clearViewTokens.id, row.clearViewTokenId),
            eq(clearViewTokens.userId, input.userId),
            eq(clearViewTokens.tokenHash, input.tokenHash),
            gt(clearViewTokens.expiresAt, input.now),
            isNull(clearViewTokens.consumedAt),
          ),
        )
        .returning({ clearViewTokenId: clearViewTokens.id });

      if (consumedRows.length !== 1) {
        return null;
      }

      return {
        studentIdCiphertext: row.studentIdCiphertext,
        clearedAt: row.clearedAt,
        clearReceiptCode: row.clearReceiptCode,
      };
    });
  }
}
