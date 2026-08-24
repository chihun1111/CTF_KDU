import { Injectable } from "@nestjs/common";

const CLEAR_COOKIE_NAME = "ctf_clear_once";

@Injectable()
export class ClearCookieService {
  buildClearCookie(clearToken: string, maxAgeSeconds: number): string {
    return [
      `${CLEAR_COOKIE_NAME}=${encodeURIComponent(clearToken)}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/clear",
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ].join("; ");
  }

  buildExpiredClearCookie(): string {
    return [
      `${CLEAR_COOKIE_NAME}=`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/clear",
      "Max-Age=0",
    ].join("; ");
  }
}
