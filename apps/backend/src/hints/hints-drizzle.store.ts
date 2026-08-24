import { desc, eq } from "drizzle-orm";
import { auditLogs } from "@campus-ctf/db";
import type { HintReleaseRow, HintReleaseStore } from "./hints.service.js";

type DatabaseClientLike = {
  db: {
    select(selection?: unknown): any;
  };
};

function readStageId(metadata: unknown): string | null {
  const value = metadata as { stageId?: unknown } | null | undefined;
  return typeof value?.stageId === "string" ? value.stageId : null;
}

export class HintReleaseDrizzleStore implements HintReleaseStore {
  constructor(private readonly database: DatabaseClientLike) {}

  async listHintReleases(): Promise<HintReleaseRow[]> {
    const rows = await this.database.db
      .select({
        adminUserId: auditLogs.userId,
        metadata: auditLogs.metadata,
        releasedAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.action, "ADMIN_HINT_STAGE_RELEASED"))
      .orderBy(desc(auditLogs.createdAt));

    return (rows as Array<{ adminUserId: string | null; metadata: unknown; releasedAt: Date }>)
      .map((row) => {
        const stageId = readStageId(row.metadata);
        if (!stageId) {
          return null;
        }
        return {
          stageId,
          releasedAt: row.releasedAt,
          adminUserId: row.adminUserId,
        };
      })
      .filter((row): row is HintReleaseRow => row !== null);
  }
}
