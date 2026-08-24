import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { InMemoryPresenceStore } from "./in-memory-presence.store.js";
import { OnlineCountDrizzleStore } from "./online-count-drizzle.store.js";
import { OnlineCountService, type OnlineCountFallbackStore, type OnlineCountPresenceStore } from "./online-count.service.js";
import { PresenceController } from "./presence.controller.js";
import { PresenceHeartbeatService, type PresenceStore } from "./presence-heartbeat.service.js";
import { createRedisClientFromEnv } from "./redis-client.js";
import { RedisPresenceStore, type RedisPresenceClient } from "./redis-presence.store.js";

export const PRESENCE_STORE = Symbol("PRESENCE_STORE");
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
export const ONLINE_COUNT_FALLBACK_STORE = Symbol("ONLINE_COUNT_FALLBACK_STORE");

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [PresenceController],
  providers: [
    InMemoryPresenceStore,
    {
      provide: REDIS_CLIENT,
      useFactory: (): Promise<RedisPresenceClient | null> => createRedisClientFromEnv(),
    },
    {
      provide: RedisPresenceStore,
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: RedisPresenceClient | null) =>
        redisClient ? new RedisPresenceStore(redisClient) : null,
    },
    {
      provide: PRESENCE_STORE,
      inject: [RedisPresenceStore, InMemoryPresenceStore],
      useFactory: (redisStore: PresenceStore | null, fallbackStore: InMemoryPresenceStore) =>
        redisStore ?? fallbackStore,
    },
    {
      provide: OnlineCountDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof OnlineCountDrizzleStore>[0]) =>
        new OnlineCountDrizzleStore(databaseClient),
    },
    {
      provide: ONLINE_COUNT_FALLBACK_STORE,
      useExisting: OnlineCountDrizzleStore,
    },
    {
      provide: OnlineCountService,
      inject: [PRESENCE_STORE, ONLINE_COUNT_FALLBACK_STORE],
      useFactory: (presenceStore: OnlineCountPresenceStore, fallbackStore: OnlineCountFallbackStore) =>
        new OnlineCountService(presenceStore, fallbackStore),
    },
    {
      provide: PresenceHeartbeatService,
      inject: [PRESENCE_STORE],
      useFactory: (store: PresenceStore) => new PresenceHeartbeatService(store),
    },
  ],
  exports: [PresenceHeartbeatService, OnlineCountService, PRESENCE_STORE, REDIS_CLIENT],
})
export class PresenceModule {}
