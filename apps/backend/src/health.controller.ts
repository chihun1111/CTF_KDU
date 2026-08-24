import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { users } from "@campus-ctf/db";
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
    select(selection?: unknown): {
      from(table: unknown): Promise<unknown[]>;
    };
  };
};

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

@Controller()
export class HealthController {
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
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    return {
      backend: {
        status: "ok",
        checkedAt: now.toISOString(),
      },
      postgres,
      redis,
    };
  }

  private async checkPostgres(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      const rows = await this.database?.db.select({ count: sql<number>`count(*)` }).from(users);
      return {
        status: Array.isArray(rows) ? "ok" : "down",
        latencyMs: elapsedMs(start),
      };
    } catch {
      return {
        status: "down",
        latencyMs: elapsedMs(start),
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    if (!this.redis) {
      return {
        status: "degraded",
        latencyMs: elapsedMs(start),
      };
    }
    try {
      await this.redis.keys("__healthcheck__");
      return {
        status: "ok",
        latencyMs: elapsedMs(start),
      };
    } catch {
      return {
        status: "down",
        latencyMs: elapsedMs(start),
      };
    }
  }
}
