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
  let client: ReturnType<typeof connect>;
  let closed = false;

  function connect() {
    const next = createClient({
      url: redisUrl,
      socket: { connectTimeout: 2_000 },
      disableOfflineQueue: true,
      commandsQueueMaxLength: 256,
      commandOptions: { timeout: 1_000 },
    });
    attachRedisPresenceErrorHandler(next);
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const clearReadyTimer = () => clearTimeout(readyTimer);
    next.on("connect", () => {
      clearReadyTimer();
      if (closed || next !== client) return;
      // TCP connectTimeout ends before Redis AUTH/HELLO/CLIENT handshakes.
      readyTimer = setTimeout(() => replace(next), 3_000);
      readyTimer.unref();
    });
    next.on("ready", clearReadyTimer);
    next.on("end", clearReadyTimer);
    // Presence is optional. Reconnect in the background without blocking startup.
    void next.connect().catch(() => undefined);
    return next;
  }
  function replace(target: typeof client) {
    if (closed || target !== client) return;
    if (target.isOpen) target.destroy();
    client = connect();
  }
  client = connect();

  function run<T>(operation: (target: typeof client) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (closed) return Promise.reject(new Error("Redis presence client is closed"));
    if (signal?.aborted) return Promise.reject(new Error("Redis presence operation aborted"));
    const target = client;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (error !== undefined) reject(error); else resolve(value as T);
        return true;
      };
      const cancel = (message: string) => {
        if (!finish(new Error(message))) return;
        // node-redis command cancellation may stop at socket write. Destroy a
        // stalled connection too, so in-flight replies cannot retain resources.
        replace(target);
      };
      const abort = () => cancel("Redis presence operation aborted");
      const timer = setTimeout(() => cancel("Redis presence command timeout"), 1_000);
      signal?.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(() => operation(target)).then((value) => finish(undefined, value), (error: unknown) => finish(error));
    });
  }
  return {
    setEx: (key, seconds, value) => run((target) => target.setEx(key, seconds, value)),
    ping: () => run((target) => target.ping()),
    scan: (cursor, options, abortSignal) => run((target) => target.scan(cursor, options), abortSignal),
    onModuleDestroy() {
      closed = true;
      if (client.isOpen) client.destroy();
    },
  };
}
