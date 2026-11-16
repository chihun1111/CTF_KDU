import { readTokenCookie } from "./read-token-cookie.js";

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  role: "participant" | "admin";
};

export type SessionAuthStore = {
  findActiveSessionByHash(sessionHash: string, now: Date): Promise<AuthenticatedSession | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
};

type SessionCrypto = {
  sessionHash(sessionToken: string): string;
};

export class SessionAuthService {
  constructor(
    private readonly store: SessionAuthStore,
    private readonly crypto: SessionCrypto,
  ) {}

  async authenticateCookieHeader(cookieHeader: string | undefined): Promise<AuthenticatedSession | null> {
    const sessionToken = readTokenCookie(cookieHeader, "ctf_session");
    if (!sessionToken) {
      return null;
    }

    const now = new Date();
    const session = await this.store.findActiveSessionByHash(this.crypto.sessionHash(sessionToken), now);
    if (!session) {
      return null;
    }

    await this.store.touchSession(session.sessionId, now);
    return session;
  }
}
