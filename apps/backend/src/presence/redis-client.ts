import type { RedisPresenceClient } from "./redis-presence.store.js";

export type RedisPresenceClientFactory = (url: string) => Promise<RedisPresenceClient>;
export type RedisClientWithErrorEvents = {
  on(event: "error", listener: (error: unknown) => void): unknown;
};

export function attachRedisPresenceErrorHandler(client: RedisClientWithErrorEvents): void {
  client.on("error", () => {
    // Redis is a presence cache. Operation callers handle fallback; this prevents socket errors from crashing Nest.
  });
}

export async function createRedisClientFromEnv(
  env: Record<string, string | undefined> = process.env,
  factory: RedisPresenceClientFactory = createRedisPresenceClient,
): Promise<RedisPresenceClient | null> {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) {
    return null;
  }

  return factory(redisUrl);
}

export async function createRedisPresenceClient(redisUrl: string): Promise<RedisPresenceClient> {
  const { createClient } = await import("redis");
  const client = createClient({ url: redisUrl });
  attachRedisPresenceErrorHandler(client);
  await client.connect();
  return {
    setEx: (key, seconds, value) => client.setEx(key, seconds, value),
    keys: (pattern) => client.keys(pattern),
  };
}
