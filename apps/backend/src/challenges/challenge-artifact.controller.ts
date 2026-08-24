import { Controller, Get, Inject, Param, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ChallengeArtifactService } from "./challenge-artifact.service.js";

type ResponseLike = {
  setHeader(name: string, value: string | number): void;
};

type ChallengeArtifactReader = Pick<ChallengeArtifactService, "getArtifactForParticipant">;

@Controller("api/services")
export class ChallengeArtifactController {
  constructor(@Inject(ChallengeArtifactService) private readonly artifactReader: ChallengeArtifactReader) {}

  @Get(":slug/artifact")
  @UseGuards(SessionAuthGuard)
  async download(
    @Req() request: AuthenticatedRequest,
    @Param("slug") slug: string,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<StreamableFile> {
    const artifact = await this.artifactReader.getArtifactForParticipant(request.authSession.userId, slug);

    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${artifact.filename}"`);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Length", artifact.body.byteLength);
    response.setHeader("ETag", artifact.etag);

    return new StreamableFile(artifact.body);
  }
}
