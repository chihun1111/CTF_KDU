import { Controller, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import { AuditService, type AdminReadAuditInput } from "../audit/audit.service.js";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { OnlineCountService, type OnlineCountResult } from "../presence/online-count.service.js";
import { AdminOperationsService, type AdminOperationsSummary } from "./admin-operations.service.js";

type OnlineCountReader = Pick<OnlineCountService, "getOnlineCount">;
type AdminReadHandler = Pick<AdminOperationsService, "getSummary" | "listParticipants" | "listSubmissions" | "listClears">;
type AuditRecorder = Pick<AuditService, "recordAdminRead" | "recordOnlineCountRead">;
type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

@Controller("api/admin/operations")
export class AdminOperationsController {
  constructor(
    @Inject(OnlineCountService) private readonly onlineCountReader: OnlineCountReader,
    @Inject(AdminOperationsService) private readonly adminReader: AdminReadHandler,
    @Inject(AuditService) private readonly auditRecorder: AuditRecorder,
  ) {}

  @Get("summary")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async summary(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminOperationsSummary> {
    this.noStore(response);
    await this.recordAdminRead(request, "operations.summary");
    return this.adminReader.getSummary();
  }

  @Get("online-count")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async onlineCount(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<OnlineCountResult> {
    this.noStore(response);
    const onlineCount = await this.onlineCountReader.getOnlineCount();
    await this.auditRecorder.recordOnlineCountRead({
      adminUserId: request.authSession.userId,
      onlineSessionCount: onlineCount.onlineSessionCount,
      source: onlineCount.source,
      windowSeconds: onlineCount.windowSeconds,
      generatedAt: onlineCount.generatedAt,
    });
    return onlineCount;
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
