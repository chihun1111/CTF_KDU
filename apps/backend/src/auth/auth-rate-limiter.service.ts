import { HttpException, HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";

type RateLimitOptions = {
  registerMaxAttempts: number;
  loginMaxAttempts: number;
  loginIpMaxAttempts: number;
  loginAccountMaxAttempts: number;
  windowMs: number;
  maxEntries: number;
};

const DEFAULT_OPTIONS: RateLimitOptions = {
  registerMaxAttempts: 10,
  loginMaxAttempts: 10,
  // The higher IP allowance accommodates participants behind a campus NAT.
  loginIpMaxAttempts: 300,
  loginAccountMaxAttempts: 30,
  windowMs: 60_000,
  maxEntries: 10_000,
};

export const AUTH_RATE_LIMIT_OPTIONS = Symbol("AUTH_RATE_LIMIT_OPTIONS");

type Counter = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthRateLimiterService {
  private readonly counters = new Map<string, Counter>();
  private readonly options: RateLimitOptions;
  private nextSweepAt = 0;

  constructor(@Optional() @Inject(AUTH_RATE_LIMIT_OPTIONS) options: Partial<RateLimitOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    if (Object.values(this.options).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error("Rate limit options must be positive integers");
    }
  }

  async checkRegister(ipHash: string, now = new Date()): Promise<void> {
    this.consume(`register:${ipHash}`, this.options.registerMaxAttempts, now);
  }

  async checkLogin(ipHash: string, studentIdHash: string, now = new Date()): Promise<void> {
    this.consume(`login-ip:${ipHash}`, this.options.loginIpMaxAttempts, now);
    this.consume(`login-account:${studentIdHash}`, this.options.loginAccountMaxAttempts, now);
    this.consume(`login:${ipHash}:${studentIdHash}`, this.options.loginMaxAttempts, now);
  }

  private consume(key: string, maxAttempts: number, now: Date): void {
    const nowMs = now.getTime();
    if (nowMs >= this.nextSweepAt) {
      for (const [existingKey, counter] of this.counters) {
        if (counter.resetAt <= nowMs) this.counters.delete(existingKey);
      }
      this.nextSweepAt = nowMs + Math.min(this.options.windowMs, 1_000);
    }
    const current = this.counters.get(key);
    if (!current && this.counters.size >= this.options.maxEntries) {
      // Do not evict an active counter: that would let new identities bypass limits.
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
    const counter = !current || current.resetAt <= nowMs ? { count: 0, resetAt: nowMs + this.options.windowMs } : current;

    counter.count = Math.min(counter.count + 1, maxAttempts + 1);
    this.counters.set(key, counter);

    if (counter.count > maxAttempts) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
