import { CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";

type BrowserRequest = {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/** Protect platform mutations while leaving the intentionally vulnerable labs separate. */
export class ApiOriginGuard implements CanActivate {
  private readonly publicOrigin: string;

  constructor(publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost") {
    const url = new URL(publicBaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("PUBLIC_BASE_URL must be an HTTP(S) URL without credentials");
    }
    this.publicOrigin = url.origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BrowserRequest>();
    const path = request.path ?? request.url ?? "";
    if (!path.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(request.method?.toUpperCase() ?? "GET")) {
      return true;
    }

    const origin = request.headers?.origin;
    const fetchSite = request.headers?.["sec-fetch-site"];
    if (origin !== undefined && origin !== this.publicOrigin) {
      throw new ForbiddenException("Cross-origin request rejected");
    }
    if (fetchSite === "cross-site" || (origin === undefined && fetchSite !== undefined && fetchSite !== "same-origin")) {
      throw new ForbiddenException("Cross-origin request rejected");
    }
    // Non-browser tools and authenticated server-to-server requests omit browser
    // metadata; their existing authentication and authorization still apply.
    return true;
  }
}
