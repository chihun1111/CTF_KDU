import { BadRequestException, Controller, Get, Inject, Query, Req, Res, UseGuards } from "@nestjs/common";
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

function readPage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value) || Number(value) > 100_000) {
    throw new BadRequestException("Invalid page");
  }
  return Number(value);
}

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
    @Query("page") pageInput?: string,
  ): Promise<AdminListResponse<AdminParticipantListItem>> {
    this.noStore(response);
    const page = readPage(pageInput);
    await this.recordAdminRead(request, "participants", page);
    return this.adminReader.listParticipants(page, 50);
  }

  @Get("submissions")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async submissions(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
    @Query("page") pageInput?: string,
  ): Promise<AdminListResponse<AdminSubmissionListItem>> {
    this.noStore(response);
    const page = readPage(pageInput);
    await this.recordAdminRead(request, "submissions", page);
    return this.adminReader.listSubmissions(page, 50);
  }

  @Get("clears")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async clears(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderWriter,
    @Query("page") pageInput?: string,
  ): Promise<AdminListResponse<AdminClearListItem>> {
    this.noStore(response);
    const page = readPage(pageInput);
    await this.recordAdminRead(request, "clears", page);
    return this.adminReader.listClears(page, 50);
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
    @Query("page") pageInput?: string,
  ): Promise<AdminListResponse<AdminAuditLogItem>> {
    this.noStore(response);
    const page = readPage(pageInput);
    await this.recordAdminRead(request, "audit-logs", page);
    return this.adminReader.listAuditLogs(page, 50);
  }

  private noStore(response: HeaderWriter): void {
    response.setHeader("Cache-Control", "no-store");
  }

  private recordAdminRead(
    request: AuthenticatedRequest,
    resource: AdminReadAuditInput["resource"],
    page = 1,
  ): Promise<void> {
    const input = {
      adminUserId: request.authSession.userId,
      resource,
      page,
      pageSize: 50,
    };
    return this.auditRecorder.recordAdminRead(input);
  }
}
