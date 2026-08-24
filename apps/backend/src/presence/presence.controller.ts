import { Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { PresenceHeartbeatService } from "./presence-heartbeat.service.js";

type PresenceHeartbeatHandler = Pick<PresenceHeartbeatService, "heartbeat">;

@Controller("api/presence")
export class PresenceController {
  constructor(@Inject(PresenceHeartbeatService) private readonly heartbeatHandler: PresenceHeartbeatHandler) {}

  @Post("heartbeat")
  @UseGuards(SessionAuthGuard)
  async heartbeat(@Req() request: AuthenticatedRequest): Promise<{ ok: true }> {
    return this.heartbeatHandler.heartbeat(request.authSession);
  }
}
