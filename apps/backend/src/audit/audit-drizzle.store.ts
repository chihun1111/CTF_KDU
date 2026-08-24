import { auditLogs } from "@campus-ctf/db";
import type { AuditStore } from "./audit.service.js";

type DatabaseClientLike = {
  db: {
    insert(table: unknown): {
      values(value: unknown): Promise<unknown[]>;
    };
  };
};

export class AuditDrizzleStore implements AuditStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async createAuditLog(input: Parameters<AuditStore["createAuditLog"]>[0]): Promise<void> {
    await this.database.db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      metadata: input.metadata,
    });
  }
}
