import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthenticatedSession, SessionAuthService } from "./session-auth.service.js";

type SessionReader = Pick<SessionAuthService, "authenticateCookieHeader">;

type RequestWithAuthSession = {
  headers?: {
    cookie?: unknown;
  };
  authSession?: AuthenticatedSession;
};

export type AuthenticatedRequest = RequestWithAuthSession & {
  authSession: AuthenticatedSession;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionAuthService) private readonly sessionReader: SessionReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthSession>();
    const cookieHeader = typeof request.headers?.cookie === "string" ? request.headers.cookie : undefined;
    const session = await this.sessionReader.authenticateCookieHeader(cookieHeader);
    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    request.authSession = session;
    return true;
  }
}
