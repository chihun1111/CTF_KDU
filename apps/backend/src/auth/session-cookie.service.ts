import { Injectable } from "@nestjs/common";

const SESSION_COOKIE_NAME = "ctf_session";

@Injectable()
export class SessionCookieService {
  buildSessionCookie(sessionToken: string, maxAgeSeconds: number): string {
    return this.serialize(encodeURIComponent(sessionToken), Math.max(0, Math.floor(maxAgeSeconds)));
  }

  buildExpiredSessionCookie(): string {
    return this.serialize("", 0);
  }

  private serialize(value: string, maxAgeSeconds: number): string {
    return [
      `${SESSION_COOKIE_NAME}=${value}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${maxAgeSeconds}`,
    ].join("; ");
  }
}
