import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ChallengesService } from "./challenges.service.js";

type ProgressReader = Pick<ChallengesService, "getProgressForParticipant">;

@Controller("api/progress")
export class ProgressController {
  constructor(@Inject(ChallengesService) private readonly progressReader: ProgressReader) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async get(@Req() request: AuthenticatedRequest): ReturnType<ProgressReader["getProgressForParticipant"]> {
    return this.progressReader.getProgressForParticipant(request.authSession.userId);
  }
}
