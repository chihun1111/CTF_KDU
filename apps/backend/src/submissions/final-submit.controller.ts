import { Body, Controller, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest, SessionAuthGuard } from "../auth/session-auth.guard.js";
import { FinalSubmitInput, FinalSubmitService } from "./final-submit.service.js";

type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

type FinalSubmitHandler = Pick<FinalSubmitService, "submit">;

@Controller("api")
export class FinalSubmitController {
  constructor(@Inject(FinalSubmitService) private readonly finalSubmitHandler: FinalSubmitHandler) {}

  @Post("final-submit")
  @UseGuards(SessionAuthGuard)
  async submit(
    @Req() request: AuthenticatedRequest,
    @Body() input: FinalSubmitInput,
    @Res({ passthrough: true }) response: HeaderWriter,
  ) {
    const result = await this.finalSubmitHandler.submit(request.authSession.userId, input);
    if (result.setCookie) {
      response.setHeader("Set-Cookie", result.setCookie);
    }
    response.setHeader("Cache-Control", "no-store");
    return result.body;
  }
}
