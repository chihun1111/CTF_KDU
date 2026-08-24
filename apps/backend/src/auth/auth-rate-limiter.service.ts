import { HttpException, HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";

type RateLimitOptions = {
  registerMaxAttempts: number;
  loginMaxAttempts: number;
  windowMs: number;
};

const DEFAULT_OPTIONS: RateLimitOptions = {
  registerMaxAttempts: 10,
  loginMaxAttempts: 10,
  windowMs: 60_000,
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

  constructor(@Optional() @Inject(AUTH_RATE_LIMIT_OPTIONS) options: Partial<RateLimitOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async checkRegister(ipHash: string, now = new Date()): Promise<void> {
    this.consume(`register:${ipHash}`, this.options.registerMaxAttempts, now);
  }

  async checkLogin(ipHash: string, studentIdHash: string, now = new Date()): Promise<void> {
    this.consume(`login:${ipHash}:${studentIdHash}`, this.options.loginMaxAttempts, now);
  }

  private consume(key: string, maxAttempts: number, now: Date): void {
    const nowMs = now.getTime();
    const current = this.counters.get(key);
    const counter = !current || current.resetAt <= nowMs ? { count: 0, resetAt: nowMs + this.options.windowMs } : current;

    counter.count += 1;
    this.counters.set(key, counter);

    if (counter.count > maxAttempts) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
