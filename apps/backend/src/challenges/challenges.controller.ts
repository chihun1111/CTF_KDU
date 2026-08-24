import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ChallengesService } from "./challenges.service.js";

type ChallengeListReader = Pick<ChallengesService, "listForParticipant">;

@Controller("api/services")
export class ChallengesController {
  constructor(@Inject(ChallengesService) private readonly challengeListReader: ChallengeListReader) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async list(@Req() request: AuthenticatedRequest): ReturnType<ChallengeListReader["listForParticipant"]> {
    return this.challengeListReader.listForParticipant(request.authSession.userId);
  }
}
