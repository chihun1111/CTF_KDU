import { Controller, Headers, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ClearCertificateService } from "./clear-certificate.service.js";

type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

type ClearCertificateConsumer = Pick<ClearCertificateService, "consume">;

@Controller("api/clear-certificate")
export class ClearCertificateController {
  constructor(@Inject(ClearCertificateService) private readonly clearCertificateConsumer: ClearCertificateConsumer) {}

  @Post("consume")
  @UseGuards(SessionAuthGuard)
  async consume(
    @Req() request: AuthenticatedRequest,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: HeaderWriter,
  ) {
    const result = await this.clearCertificateConsumer.consume(request.authSession.userId, cookieHeader);
    response.setHeader("Set-Cookie", result.setCookie);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    return result.body;
  }
}
