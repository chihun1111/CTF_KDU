import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { attachRedisPresenceErrorHandler, createRedisClientFromEnv, createRedisPresenceClient } from "./redis-client.js";

test("createRedisClientFromEnv connects only when REDIS_URL is configured", async () => {
  const events: string[] = [];
  const client = {
    setEx: async () => undefined,
    ping: async () => "PONG",
    scan: async () => ({ cursor: "0", keys: [] }),
  };
  const factory = async (url: string) => {
    events.push(`connect:${url}`);
    return client;
  };

  assert.equal(await createRedisClientFromEnv({}, factory), null);
  assert.equal(await createRedisClientFromEnv({ REDIS_URL: "   " }, factory), null);
  assert.equal(await createRedisClientFromEnv({ REDIS_URL: "redis://redis:6379" }, factory), client);
  assert.deepEqual(events, ["connect:redis://redis:6379"]);
});

async function fakeRedis(reply: (command: string, connection: number) => string | null) {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server = createServer((socket) => {
    const connection = ++connections;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString();
      while (pending) {
        const headerEnd = pending.indexOf("\r\n");
        if (headerEnd < 0) return;
        const count = Number(pending.slice(1, headerEnd));
        let offset = headerEnd + 2;
        const args: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const end = pending.indexOf("\r\n", offset);
          if (end < 0) return;
          const length = Number(pending.slice(offset + 1, end));
          if (pending.length < end + 2 + length + 2) return;
          args.push(pending.slice(end + 2, end + 2 + length));
          offset = end + 2 + length + 2;
        }
        pending = pending.slice(offset);
        const response = reply(args[0] ?? "", connection);
        if (response !== null) socket.write(response);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    url: `redis://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("an unavailable Redis handshake cannot block application startup or queue heartbeats", { timeout: 5_000 }, async () => {
  const server = await fakeRedis(() => null);
  const start = Date.now();
  const client = await createRedisPresenceClient(server.url);
  try {
    assert(Date.now() - start < 1_500, "optional cache blocked application startup");
    await assert.rejects(client.setEx("presence:session:test", 90, "1"));
  } finally {
    client.onModuleDestroy?.();
    client.onModuleDestroy?.();
    await server.close();
  }
});

test("a stalled Redis handshake is replaced and the cache recovers automatically", { timeout: 8_000 }, async () => {
  let connections = 0;
  const server = await fakeRedis((command, connection) => {
    connections = Math.max(connections, connection);
    if (connection === 1) return null;
    return command === "PING" ? "+PONG\r\n" : "+OK\r\n";
  });
  const client = await createRedisPresenceClient(server.url);
  try {
    const readyBy = Date.now() + 6_000;
    for (;;) {
      try { assert.equal(await client.ping(), "PONG"); break; }
      catch (error) { if (Date.now() > readyBy) throw error; await delay(25); }
    }
    assert(connections >= 2, "handshake stall was not reconnected");
  } finally {
    client.onModuleDestroy?.();
    await server.close();
  }
});

test("a connected but stalled Redis has bounded command time and queue capacity", { timeout: 8_000 }, async () => {
  let stalled = false;
  const server = await fakeRedis((command) => command === "PING" ? (stalled ? null : "+PONG\r\n") : "+OK\r\n");
  const client = await createRedisPresenceClient(server.url);
  try {
    const readyBy = Date.now() + 2_000;
    for (;;) {
      try { await client.ping(); break; }
      catch (error) { if (Date.now() > readyBy) throw error; await delay(10); }
    }
    stalled = true;
    const start = Date.now();
    const results = await Promise.allSettled(Array.from({ length: 300 }, () => client.ping()));
    assert(results.every((result) => result.status === "rejected"));
    assert(results.some((result) => result.status === "rejected" && /queue.*full/i.test(String(result.reason))));
    assert(results.some((result) => result.status === "rejected" && /timeout/i.test(String(result.reason))));
    assert(Date.now() - start < 3_000, "stalled cache commands did not settle");
  } finally {
    client.onModuleDestroy?.();
    await server.close();
  }
});

test("attachRedisPresenceErrorHandler registers an error listener for socket failures", () => {
  const events: string[] = [];

  attachRedisPresenceErrorHandler({
    on(event, listener) {
      events.push(event);
      listener(new Error("Socket closed unexpectedly"));
    },
  });

  assert.deepEqual(events, ["error"]);
});
