import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions, users } from "@campus-ctf/db";
import type { AuthenticatedSession, SessionAuthStore } from "./session-auth.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        innerJoin(table: unknown, condition: unknown): {
          where(condition: unknown): {
            limit(count: number): Promise<unknown[]>;
          };
        };
      };
    };
    update(table: unknown): {
      set(value: unknown): {
        where(condition: unknown): Promise<unknown>;
      };
    };
  };
};

export class SessionAuthDrizzleStore implements SessionAuthStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async findActiveSessionByHash(sessionHash: string, now: Date): Promise<AuthenticatedSession | null> {
    const rows = await this.database.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.sessionHash, sessionHash), gt(sessions.expiresAt, now), isNull(sessions.revokedAt)))
      .limit(1);

    const [row] = rows as Array<{ sessionId?: unknown; userId?: unknown; role?: unknown }>;
    if (
      typeof row?.sessionId !== "string" ||
      typeof row.userId !== "string" ||
      (row.role !== "participant" && row.role !== "admin")
    ) {
      return null;
    }

    return {
      sessionId: row.sessionId,
      userId: row.userId,
      role: row.role,
    };
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.database.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, sessionId));
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.database.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
  }
}
