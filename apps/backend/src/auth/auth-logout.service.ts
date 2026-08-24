import type { AuthenticatedSession } from "./session-auth.service.js";

export type LogoutStore = {
  revokeSession(sessionId: string, now: Date): Promise<void>;
};

export type LogoutResult = {
  body: { ok: true };
  setCookie: string;
};

type SessionAuthenticator = {
  authenticateCookieHeader(cookieHeader: string | undefined): Promise<AuthenticatedSession | null>;
};

type ExpiredSessionCookieBuilder = {
  buildExpiredSessionCookie(): string;
};

export class AuthLogoutService {
  constructor(
    private readonly sessionAuth: SessionAuthenticator,
    private readonly store: LogoutStore,
    private readonly sessionCookie: ExpiredSessionCookieBuilder,
  ) {}

  async logout(cookieHeader: string | undefined): Promise<LogoutResult> {
    const session = await this.sessionAuth.authenticateCookieHeader(cookieHeader);
    if (session) {
      await this.store.revokeSession(session.sessionId, new Date());
    }

    return {
      body: { ok: true },
      setCookie: this.sessionCookie.buildExpiredSessionCookie(),
    };
  }
}
