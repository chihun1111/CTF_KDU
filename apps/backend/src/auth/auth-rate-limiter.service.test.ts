import assert from "node:assert/strict";
import test from "node:test";
import { HttpException, HttpStatus } from "@nestjs/common";
import { AuthRateLimiterService } from "./auth-rate-limiter.service.js";

async function assertRateLimited(action: () => Promise<void>) {
  await assert.rejects(
    action,
    (error) => error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
  );
}

test("AuthRateLimiterService limits register by IP hash and login by IP plus student hash", async () => {
  const limiter = new AuthRateLimiterService({
    registerMaxAttempts: 2,
    loginMaxAttempts: 2,
    windowMs: 60_000,
  });
  const now = new Date("2026-05-10T00:00:00.000Z");

  await limiter.checkRegister("ip-hash", now);
  await limiter.checkRegister("ip-hash", now);
  await assertRateLimited(() => limiter.checkRegister("ip-hash", now));

  await limiter.checkLogin("ip-hash", "student-hash", now);
  await limiter.checkLogin("ip-hash", "student-hash", now);
  await assertRateLimited(() => limiter.checkLogin("ip-hash", "student-hash", now));

  await limiter.checkRegister("ip-hash", new Date("2026-05-10T00:01:01.000Z"));
  await limiter.checkLogin("ip-hash", "student-hash", new Date("2026-05-10T00:01:01.000Z"));
});

test("login limits cover password spraying and distributed attempts against one account", async () => {
  const limiter = new AuthRateLimiterService({ loginIpMaxAttempts: 2, loginAccountMaxAttempts: 2 });
  const now = new Date("2026-05-10T00:00:00Z");
  await limiter.checkLogin("shared-ip", "one", now);
  await limiter.checkLogin("shared-ip", "two", now);
  await assertRateLimited(() => limiter.checkLogin("shared-ip", "three", now));

  await limiter.checkLogin("ip-a", "target", now);
  await limiter.checkLogin("ip-b", "target", now);
  await assertRateLimited(() => limiter.checkLogin("ip-c", "target", now));
});

test("expired counters are reclaimed and active counters cannot be evicted to bypass limits", async () => {
  const limiter = new AuthRateLimiterService({ maxEntries: 2, registerMaxAttempts: 1, windowMs: 1_000 });
  const now = new Date("2026-05-10T00:00:00Z");
  await limiter.checkRegister("one", now);
  await limiter.checkRegister("two", now);
  await assertRateLimited(() => limiter.checkRegister("three", now));
  await assertRateLimited(() => limiter.checkRegister("one", now));
  await limiter.checkRegister("three", new Date(now.getTime() + 1_001));
  await limiter.checkRegister("four", new Date(now.getTime() + 1_001));
});
