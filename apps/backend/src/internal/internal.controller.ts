import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import {
  InternalClaimService,
  type IssueClaimBody,
  type IssueClaimRequest,
  type VerifyClaimBody,
  type VerifyClaimRequest,
} from "./internal-claim.service.js";
import { InternalFlagService, type InternalFlagRequest } from "./internal-flag.service.js";

type InternalFlagReader = Pick<InternalFlagService, "getChallengeFlag">;
type InternalClaimVerifier = Pick<InternalClaimService, "issueClaim" | "verifyClaim">;

@Controller("internal")
export class InternalController {
  constructor(
    @Inject(InternalFlagService) private readonly internalFlagReader: InternalFlagReader,
    @Inject(InternalClaimService) private readonly internalClaimVerifier: InternalClaimVerifier,
  ) {}

  @Get("challenges/:challengeId/flag")
  @Header("Cache-Control", "private, no-store")
  async getChallengeFlag(
    @Param("challengeId") challengeId: string,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
  ): ReturnType<InternalFlagReader["getChallengeFlag"]> {
    const input: InternalFlagRequest = {
      challengeId,
      authorizationHeader,
      cookieHeader,
    };
    return this.internalFlagReader.getChallengeFlag(input);
  }

  @Post("claims/verify")
  @Header("Cache-Control", "private, no-store")
  async verifyClaim(
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: VerifyClaimBody,
  ): ReturnType<InternalClaimVerifier["verifyClaim"]> {
    const input: VerifyClaimRequest = {
      authorizationHeader,
      cookieHeader,
      body,
    };
    return this.internalClaimVerifier.verifyClaim(input);
  }

  @Post("claims/issue")
  @Header("Cache-Control", "private, no-store")
  async issueClaim(
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: IssueClaimBody,
  ): ReturnType<InternalClaimVerifier["issueClaim"]> {
    const input: IssueClaimRequest = {
      authorizationHeader,
      cookieHeader,
      body,
    };
    return this.internalClaimVerifier.issueClaim(input);
  }
}
