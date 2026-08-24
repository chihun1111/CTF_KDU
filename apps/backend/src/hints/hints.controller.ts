import { BadRequestException, Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuditService, type AdminReadAuditInput } from "../audit/audit.service.js";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { HintsService, UnknownHintStageError, type AdminHintsResponse, type HintReleaseResult, type PublicHintsResponse } from "./hints.service.js";

type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

function readStageId(body: unknown): string {
  const value = body as { stageId?: unknown } | null | undefined;
  if (typeof value?.stageId !== "string" || !/^[0-9]{2}:(first|second|extra)$/.test(value.stageId)) {
    throw new BadRequestException("Invalid hint stage");
  }
  return value.stageId;
}

@Controller()
export class HintsController {
  constructor(
    @Inject(HintsService) private readonly hints: Pick<HintsService, "getPublicHints" | "getAdminHints" | "releaseHintStage">,
    @Inject(AuditService) private readonly auditRecorder: Pick<AuditService, "recordAdminRead">,
  ) {}

  @Get("api/hints")
  @UseGuards(SessionAuthGuard)
  publicHints(@Res({ passthrough: true }) response: HeaderWriter): Promise<PublicHintsResponse> {
    this.noStore(response);
    return this.hints.getPublicHints();
  }

  @Get("api/admin/hints")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async adminHints(
    @Req() _request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminHintsResponse> {
    this.noStore(response);
    await this.recordAdminRead(_request, "hints");
    return this.hints.getAdminHints();
  }

  @Post("api/admin/hints/release")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async releaseHintStage(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<HintReleaseResult> {
    this.noStore(response);
    try {
      return await this.hints.releaseHintStage(request.authSession.userId, readStageId(body));
    } catch (error) {
      if (error instanceof UnknownHintStageError) {
        throw new BadRequestException("Invalid hint stage");
      }
      throw error;
    }
  }

  private noStore(response: HeaderWriter): void {
    response.setHeader("Cache-Control", "no-store");
  }

  private recordAdminRead(request: AuthenticatedRequest, resource: AdminReadAuditInput["resource"]): Promise<void> {
    return this.auditRecorder.recordAdminRead({
      adminUserId: request.authSession.userId,
      resource,
      page: 1,
      pageSize: 50,
    });
  }
}
