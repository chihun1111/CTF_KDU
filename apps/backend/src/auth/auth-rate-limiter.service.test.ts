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
