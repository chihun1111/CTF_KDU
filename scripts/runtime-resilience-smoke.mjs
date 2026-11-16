import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.CI !== "true" || !/^ctf-ci-\d+$/.test(process.env.COMPOSE_PROJECT_NAME ?? "")) {
  throw new Error("Cache outage checks require a disposable ctf-ci-* Compose project");
}

const base = "http://localhost:8080";
function compose(...args) {
  execFileSync("docker", ["compose", "-f", "infra/docker/docker-compose.yml", "--env-file", ".env.production", ...args], {
    stdio: "inherit", timeout: 60_000,
  });
}
function backendIdentity() {
  const id = execFileSync("docker", ["compose", "-f", "infra/docker/docker-compose.yml", "--env-file", ".env.production",
    "ps", "--quiet", "backend"], { encoding: "utf8", timeout: 10_000 }).trim();
  assert(id, "backend container is not running");
  const state = JSON.parse(execFileSync("docker", ["inspect", "--format",
    '{"startedAt":{{json .State.StartedAt}},"restartCount":{{.RestartCount}}}', id], { encoding: "utf8", timeout: 10_000 }));
  return { id, ...state };
}
async function request(path, options = {}) {
  return fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(5_000) });
}
async function healthMatches(predicate) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const response = await request("/api/health");
      if (response.ok && predicate(await response.json())) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Dependency health did not reach the expected state");
}

const studentId = String(randomInt(9_000_000, 9_999_999));
const password = "Resilience-" + randomUUID();
const register = await request("/api/auth/register", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ studentId, password, consent: { consentVersion: "ci-resilience", requiredLoggingAccepted: true, analyticsLoggingAccepted: false, cookieAccepted: true } }),
});
assert([200, 201].includes(register.status), "resilience registration failed");
const cookie = register.headers.getSetCookie().find((value) => value.startsWith("ctf_session="))?.split(";")[0];
assert(cookie, "resilience registration did not issue a session");
await register.arrayBuffer();

let backendBeforeRecovery;
try {
  compose("stop", "-t", "2", "redis", "backend");
  compose("up", "-d", "backend");
  const runningRedis = execFileSync("docker", ["compose", "-f", "infra/docker/docker-compose.yml", "--env-file", ".env.production",
    "ps", "--services", "--status", "running", "redis"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(runningRedis.trim(), "", "starting backend unexpectedly started its optional cache");
  await healthMatches((health) => health.postgres.status === "ok" && health.redis.status === "down");
  backendBeforeRecovery = backendIdentity();
  assert.equal(backendBeforeRecovery.restartCount, 0, "backend crashed while the optional cache was unavailable");

  const me = await request("/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).authenticated, true);
  const heartbeat = await request("/api/presence/heartbeat", { method: "POST", headers: { cookie } });
  assert([200, 201].includes(heartbeat.status), "cache failure broke heartbeat");
  assert.equal((await heartbeat.json()).ok, true);
  const login = await request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId, password }),
  });
  assert([200, 201].includes(login.status), "cache failure broke login");
  await login.arrayBuffer();
  console.log("[runtime-resilience-smoke] startup, session, heartbeat and login survived Redis outage");
} finally {
  compose("start", "redis");
}
await healthMatches((health) => health.postgres.status === "ok" && health.redis.status === "ok");
assert.deepEqual(backendIdentity(), backendBeforeRecovery, "backend restarted instead of reconnecting to Redis");
console.log("[runtime-resilience-smoke] Redis recovered without another backend restart");
