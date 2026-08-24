import { Controller, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import { AuditService, type AdminReadAuditInput } from "../audit/audit.service.js";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  AdminOperationsService,
  type AdminClearListItem,
  type AdminAuditLogItem,
  type AdminChallengeStatusItem,
  type AdminListResponse,
  type AdminParticipantListItem,
  type AdminSubmissionListItem,
  type AdminSystemHealth,
} from "./admin-operations.service.js";

type AdminReadHandler = Pick<
  AdminOperationsService,
  | "listParticipants"
  | "listSubmissions"
  | "listClears"
  | "listChallengeStatus"
  | "getSystemHealth"
  | "listAuditLogs"
>;
type AuditRecorder = Pick<AuditService, "recordAdminRead">;
type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

@Controller("api/admin")
export class AdminReadController {
  constructor(
    @Inject(AdminOperationsService) private readonly adminReader: AdminReadHandler,
    @Inject(AuditService) private readonly auditRecorder: AuditRecorder,
  ) {}

  @Get("participants")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async participants(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminListResponse<AdminParticipantListItem>> {
    this.noStore(response);
    await this.recordAdminRead(request, "participants");
    return this.adminReader.listParticipants();
  }

  @Get("submissions")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async submissions(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminListResponse<AdminSubmissionListItem>> {
    this.noStore(response);
    await this.recordAdminRead(request, "submissions");
    return this.adminReader.listSubmissions();
  }

  @Get("clears")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async clears(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminListResponse<AdminClearListItem>> {
    this.noStore(response);
    await this.recordAdminRead(request, "clears");
    return this.adminReader.listClears();
  }

  @Get("challenges/status")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async challengeStatus(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminChallengeStatusItem[]> {
    this.noStore(response);
    await this.recordAdminRead(request, "challenges.status");
    return this.adminReader.listChallengeStatus();
  }

  @Get("system/health")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async systemHealth(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminSystemHealth> {
    this.noStore(response);
    await this.recordAdminRead(request, "system.health");
    return this.adminReader.getSystemHealth();
  }

  @Get("audit-logs")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async auditLogs(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
  ): Promise<AdminListResponse<AdminAuditLogItem>> {
    this.noStore(response);
    await this.recordAdminRead(request, "audit-logs");
    return this.adminReader.listAuditLogs(1, 50);
  }

  private noStore(response: HeaderWriter): void {
    response.setHeader("Cache-Control", "no-store");
  }

  private recordAdminRead(
    request: AuthenticatedRequest,
    resource: AdminReadAuditInput["resource"],
  ): Promise<void> {
    const input = {
      adminUserId: request.authSession.userId,
      resource,
      page: 1,
      pageSize: 50,
    };
    return this.auditRecorder.recordAdminRead(input);
  }
}
