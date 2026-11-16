import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DATABASE_CLIENT } from "./database/database.module.js";
import { REDIS_CLIENT } from "./presence/presence.module.js";
import type { RedisPresenceClient } from "./presence/redis-presence.store.js";

interface HealthResponse {
  readonly status: "ok";
  readonly service: "backend";
}

type DependencyStatus = "ok" | "degraded" | "down";

interface DependencyHealth {
  readonly status: DependencyStatus;
  readonly latencyMs: number;
}

interface ApiHealthResponse {
  readonly backend: {
    readonly status: "ok";
    readonly checkedAt: string;
  };
  readonly postgres: DependencyHealth;
  readonly redis: DependencyHealth;
}

type DatabaseClientLike = {
  db: {
    execute(query: unknown): Promise<unknown>;
  };
};

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

@Controller()
export class HealthController {
  private snapshot: { expiresAt: number; value: { postgres: DependencyHealth; redis: DependencyHealth } } | undefined;
  private pendingSnapshot: Promise<{ postgres: DependencyHealth; redis: DependencyHealth }> | undefined;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClientLike | null,
    @Inject(REDIS_CLIENT) private readonly redis: RedisPresenceClient | null,
  ) {}

  @Get("health")
  health(): HealthResponse {
    return {
      status: "ok",
      service: "backend",
    };
  }

  @Get("api/health")
  async apiHealth(now = new Date()): Promise<ApiHealthResponse> {
    const { postgres, redis } = await this.dependencies();
    return {
      backend: {
        status: "ok",
        checkedAt: now.toISOString(),
      },
      postgres,
      redis,
    };
  }

  private async dependencies(): Promise<{ postgres: DependencyHealth; redis: DependencyHealth }> {
    if (this.snapshot && this.snapshot.expiresAt > Date.now()) return this.snapshot.value;
    this.pendingSnapshot ??= Promise.all([
      this.probe(this.database ? () => this.database!.db.execute(sql`select 1`) : null, "down"),
      this.probe(this.redis ? () => this.redis!.ping() : null, "degraded"),
    ]).then(([postgres, redis]) => {
      const value = { postgres: postgres!, redis: redis! };
      this.snapshot = { value, expiresAt: Date.now() + 1_000 };
      return value;
    }).finally(() => { this.pendingSnapshot = undefined; });
    return this.pendingSnapshot;
  }

  private async probe(operation: (() => Promise<unknown>) | null, missing: DependencyStatus): Promise<DependencyHealth> {
    const start = Date.now();
    if (!operation) return { status: missing, latencyMs: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Dependency health timeout")), 1_500);
        }),
      ]);
      return { status: "ok", latencyMs: elapsedMs(start) };
    } catch {
      return { status: "down", latencyMs: elapsedMs(start) };
    } finally {
      clearTimeout(timer);
    }
  }
}
