import { Module } from "@nestjs/common";
import { schemaTables } from "@campus-ctf/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ConfigModule } from "../config/config.module.js";
import { createDatabaseClient } from "./database-client.js";
import { buildDatabaseUrl } from "./database-url.js";

export const DATABASE_URL = Symbol("DATABASE_URL");
export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_URL,
      useFactory: () => buildDatabaseUrl(),
    },
    {
      provide: DATABASE_CLIENT,
      inject: [DATABASE_URL],
      useFactory: (databaseUrl: string) =>
        createDatabaseClient(databaseUrl, {
          PoolCtor: Pool,
          drizzleFactory: (pool, options) => drizzle(pool, { ...options, schema: schemaTables }),
        }),
    },
  ],
  exports: [DATABASE_URL, DATABASE_CLIENT],
})
export class DatabaseModule {}
