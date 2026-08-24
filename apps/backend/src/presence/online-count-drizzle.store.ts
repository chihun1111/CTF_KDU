import { and, gt, gte, isNull, sql } from "drizzle-orm";
import { sessions } from "@campus-ctf/db";
import type { OnlineCountFallbackStore } from "./online-count.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): {
      from(table: unknown): {
        where(condition: unknown): Promise<unknown[]>;
      };
    };
  };
};

export class OnlineCountDrizzleStore implements OnlineCountFallbackStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async countRecentlySeenSessions(since: Date, now: Date): Promise<number> {
    const rows = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(and(gte(sessions.lastSeenAt, since), gt(sessions.expiresAt, now), isNull(sessions.revokedAt)));

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
}
