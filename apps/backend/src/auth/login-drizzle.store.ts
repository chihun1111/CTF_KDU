import { eq } from "drizzle-orm";
import { sessions, users } from "@campus-ctf/db";
import type { LoginStore, LoginUser } from "./auth-login.service.js";

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
      values(value: unknown): {
        returning(selection?: unknown): Promise<unknown[]>;
      };
    };
  };
};

function firstSessionId(rows: unknown[]): { id: string } {
  const [row] = rows as Array<{ id?: unknown }>;
  if (typeof row?.id !== "string") {
    throw new Error("createSession did not return an id");
  }

  return { id: row.id };
}

export class LoginDrizzleStore implements LoginStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async findLoginUserByStudentIdHash(studentIdHash: string): Promise<LoginUser | null> {
    const rows = await this.database.db
      .select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
      .from(users)
      .where(eq(users.studentIdHash, studentIdHash))
      .limit(1);

    const [row] = rows as Array<{ id?: unknown; passwordHash?: unknown; role?: unknown }>;
    if (
      typeof row?.id !== "string" ||
      typeof row.passwordHash !== "string" ||
      (row.role !== "participant" && row.role !== "admin")
    ) {
      return null;
    }

    return {
      id: row.id,
      passwordHash: row.passwordHash,
      role: row.role,
    };
  }

  async createSession(input: Parameters<LoginStore["createSession"]>[0]): Promise<{ id: string }> {
    const rows = await this.database.db
      .insert(sessions)
      .values({
        userId: input.userId,
        sessionHash: input.sessionHash,
        expiresAt: input.expiresAt,
        lastSeenAt: input.lastSeenAt,
      })
      .returning({ id: sessions.id });

    return firstSessionId(rows);
  }
}
