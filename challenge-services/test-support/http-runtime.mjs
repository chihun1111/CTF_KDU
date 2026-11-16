import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export async function startServer(t, createServer) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return server.address().port;
}

export function send(port, path, method = "GET", cookie = "ctf_session=runtime-test-session", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { cookie, ...headers } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

export async function configureBackend(t) {
  const directory = await mkdtemp(join(tmpdir(), "challenge-http-test-"));
  const previous = {
    INTERNAL_SERVICE_TOKEN_FILE: process.env.INTERNAL_SERVICE_TOKEN_FILE,
    BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL,
  };
  await writeFile(join(directory, "token"), "test-internal-token");
  process.env.INTERNAL_SERVICE_TOKEN_FILE = join(directory, "token");
  process.env.BACKEND_INTERNAL_URL = "http://backend:8080";
  t.after(async () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
}

export function registerHttpRuntimeTests({ createServer, challengeId, protectedPath = "/" }) {
  test(`challenge-${challengeId} survives malformed request targets and rejects unsupported methods`, async (t) => {
    const port = await startServer(t, createServer);
    assert.equal((await send(port, "http://[")).status, 400);
    const methodResponse = await send(port, challengeId === "08" ? "/prize" : "/", "HEAD");
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.allow, "GET");
    assert.equal((await send(port, "/health")).status, 200);
  });

  test(`challenge-${challengeId} fails closed without a session and keeps revoked sessions unauthorized`, async (t) => {
    await configureBackend(t);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      calls += 1;
      assert.equal(options.headers.cookie, "ctf_session=runtime-test-session");
      assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal);
      return new Response("unauthorized", { status: 401 });
    });
    const port = await startServer(t, createServer);
    assert.equal((await send(port, protectedPath, "GET", "")).status, 401);
    assert.equal(calls, 0);
    assert.equal((await send(port, protectedPath)).status, 401);
    assert.equal(calls, 1);
  });

  test(`challenge-${challengeId} bounds upstream waits and reports outages without exposing secrets`, async (t) => {
    await configureBackend(t);
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    t.mock.method(AbortSignal, "timeout", (milliseconds) => {
      assert.equal(milliseconds, 5_000);
      return timeout(20);
    });
    t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const port = await startServer(t, createServer);
    const response = await send(port, protectedPath);
    assert.equal(response.status, 503);
    assert.equal(response.body.includes("test-internal-token"), false);
    assert.equal(response.body.includes("runtime-test-session"), false);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal((await send(port, "/health")).status, 200);

    process.env.BACKEND_INTERNAL_URL = "not a URL";
    assert.equal((await send(port, protectedPath)).status, 503);
    assert.equal((await send(port, "/health")).status, 200);
  });

  test(`challenge-${challengeId} cancels upstream work when the participant disconnects`, async (t) => {
    await configureBackend(t);
    const started = Promise.withResolvers();
    const aborted = Promise.withResolvers();
    t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
      started.resolve();
      options.signal.addEventListener("abort", () => {
        aborted.resolve();
        reject(options.signal.reason);
      }, { once: true });
    }));
    const port = await startServer(t, createServer);
    const req = request({
      host: "127.0.0.1", port, path: protectedPath,
      headers: { cookie: "ctf_session=runtime-test-session" },
    });
    req.on("error", () => {});
    req.end();
    await started.promise;
    req.destroy();
    let timer;
    try {
      await Promise.race([
        aborted.promise,
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("disconnected request kept upstream work running")), 1_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    assert.equal((await send(port, "/health")).status, 200);
  });
}
