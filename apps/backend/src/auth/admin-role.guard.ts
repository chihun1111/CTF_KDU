import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "./session-auth.guard.js";

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    if (request.authSession?.role !== "admin") {
      throw new ForbiddenException("Admin session required");
    }

    return true;
  }
}
