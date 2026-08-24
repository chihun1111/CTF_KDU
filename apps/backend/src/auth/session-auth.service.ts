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
    const sessionToken = this.extractCookie(cookieHeader, "ctf_session");
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

  private extractCookie(cookieHeader: string | undefined, name: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    for (const part of cookieHeader.split(";")) {
      const [rawName, ...rawValue] = part.trim().split("=");
      if (rawName === name) {
        const value = rawValue.join("=");
        return value ? decodeURIComponent(value) : null;
      }
    }

    return null;
  }
}
