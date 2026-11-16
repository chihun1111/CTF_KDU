import { UnauthorizedException } from "@nestjs/common";
import { parseLoginRequest, type LoginRequestDto } from "./dto/auth.dto.js";
import { DUMMY_PASSWORD_HASH } from "./password-hash.service.js";

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export type LoginUser = {
  id: string;
  passwordHash: string;
  role: "participant" | "admin";
};

export type LoginStore = {
  findLoginUserByStudentIdHash(studentIdHash: string): Promise<LoginUser | null>;
  createSession(input: {
    userId: string;
    sessionHash: string;
    expiresAt: Date;
    lastSeenAt: Date;
  }): Promise<{ id: string }>;
};

export type LoginResult = {
  body: { ok: true };
  setCookie: string;
};

type LoginCrypto = {
  studentIdHash(studentId: string): string;
  generateOpaqueToken(): string;
  sessionHash(sessionToken: string): string;
};

type PasswordVerifier = {
  verifyPassword(password: string, hash: string): Promise<boolean>;
};

type SessionCookieBuilder = {
  buildSessionCookie(sessionToken: string, maxAgeSeconds: number): string;
};

export class AuthLoginService {
  constructor(
    private readonly store: LoginStore,
    private readonly crypto: LoginCrypto,
    private readonly passwordVerifier: PasswordVerifier,
    private readonly sessionCookie: SessionCookieBuilder,
  ) {}

  async login(input: LoginRequestDto): Promise<LoginResult> {
    input = parseLoginRequest(input);
    const user = await this.store.findLoginUserByStudentIdHash(this.crypto.studentIdHash(input.studentId));
    const passwordMatches = await this.passwordVerifier.verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException("Login failed");
    }

    const sessionToken = this.crypto.generateOpaqueToken();
    const now = new Date();
    await this.store.createSession({
      userId: user.id,
      sessionHash: this.crypto.sessionHash(sessionToken),
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
    });

    return {
      body: { ok: true },
      setCookie: this.sessionCookie.buildSessionCookie(sessionToken, SESSION_MAX_AGE_SECONDS),
    };
  }
}
