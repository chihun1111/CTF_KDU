import { eq } from "drizzle-orm";
import {
  challengeFlags,
  challenges,
  cookieConsents,
  sessions,
  users,
} from "@campus-ctf/db";
import type {
  RegistrationStore,
  RegistrationTransaction,
} from "./auth-registration.service.js";

type DatabaseClientLike = {
  db: {
    transaction<T>(callback: (tx: DrizzleTransactionLike) => Promise<T>): Promise<T>;
  };
};

type DrizzleTransactionLike = {
  select(selection?: unknown): {
    from(table: unknown): {
      where(condition: unknown): {
        limit(count: number): Promise<unknown[]>;
      };
    };
  };
  insert(table: unknown): {
    values(value: unknown): {
      returning(selection?: unknown): Promise<unknown[]>;
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

export class RegistrationDrizzleStore implements RegistrationStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async transaction<T>(callback: (tx: RegistrationTransaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction((tx) => callback(new RegistrationDrizzleTransaction(tx)));
  }
}

class RegistrationDrizzleTransaction implements RegistrationTransaction {
  constructor(private readonly tx: DrizzleTransactionLike) {}

  async findUserByStudentIdHash(studentIdHash: string): Promise<{ id: string } | null> {
    const rows = await this.tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.studentIdHash, studentIdHash))
      .limit(1);

    const [row] = rows as Array<{ id?: unknown }>;
    return typeof row?.id === "string" ? { id: row.id } : null;
  }

  async createUser(input: Parameters<RegistrationTransaction["createUser"]>[0]): Promise<{ id: string }> {
    const rows = await this.tx
      .insert(users)
      .values({
        studentIdCiphertext: input.studentIdCiphertext,
        studentIdKeyVersion: input.studentIdKeyVersion,
        studentIdHash: input.studentIdHash,
        passwordHash: input.passwordHash,
      })
      .returning({ id: users.id });

    return firstId(rows, "createUser");
  }

  async recordCookieConsent(input: Parameters<RegistrationTransaction["recordCookieConsent"]>[0]): Promise<void> {
    await this.tx.insert(cookieConsents).values({
      userId: input.userId,
      consentVersion: input.consentVersion,
        requiredLoggingAccepted: input.requiredLoggingAccepted,
        analyticsLoggingAccepted: input.analyticsLoggingAccepted,
        cookieAccepted: input.cookieAccepted,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
      });
  }

  async listActiveChallenges(): Promise<Awaited<ReturnType<RegistrationTransaction["listActiveChallenges"]>>> {
    const rows = await this.tx
      .select({ id: challenges.id, flagId: challenges.flagId })
      .from(challenges)
      .where(eq(challenges.isActive, true))
      .limit(8);

    return rows as Awaited<ReturnType<RegistrationTransaction["listActiveChallenges"]>>;
  }

  async createChallengeFlags(
    userId: string,
    records: Parameters<RegistrationTransaction["createChallengeFlags"]>[1],
  ): Promise<void> {
    await this.tx.insert(challengeFlags).values(
      records.map((record) => ({
        userId,
        challengeId: record.challengeId,
        flagCiphertext: record.flagCiphertext,
        flagKeyVersion: record.flagKeyVersion,
        flagHash: record.flagHash,
      })),
    );
  }

  async createSession(input: Parameters<RegistrationTransaction["createSession"]>[0]): Promise<{ id: string }> {
    const rows = await this.tx
      .insert(sessions)
      .values({
        userId: input.userId,
        sessionHash: input.sessionHash,
        expiresAt: input.expiresAt,
        lastSeenAt: input.lastSeenAt,
      })
      .returning({ id: sessions.id });

    return firstId(rows, "createSession");
  }
}
