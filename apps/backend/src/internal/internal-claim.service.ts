import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { EncryptedFieldBundle, InternalChallengeId } from "@campus-ctf/config";
import type { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedSession, SessionAuthService } from "../auth/session-auth.service.js";
import type { FlagId } from "../challenges/challenges.service.js";
import type { CryptoService } from "../crypto/crypto.service.js";

export type InternalClaimRecord = {
  flagId: FlagId;
  flagCiphertext: EncryptedFieldBundle;
};

export type InternalClaimLookup = {
  userId: string;
  flagId: FlagId;
  tokenHash: string;
  now: Date;
};

export type InternalClaimStore = {
  findValidClaim(input: InternalClaimLookup): Promise<InternalClaimRecord | null>;
  createClaimToken(input: { userId: string; flagId: FlagId; tokenHash: string; expiresAt: Date }): Promise<void>;
};

type InternalClaimCrypto = Pick<
  CryptoService,
  "claimTokenHash" | "decryptFlagForInternalApi" | "generateOpaqueToken" | "internalServiceTokenMatches"
>;
type SessionReader = Pick<SessionAuthService, "authenticateCookieHeader">;
type ClaimFailureRecorder = Pick<AuditService, "recordClaimVerifyFailure">;
type Clock = {
  now(): Date;
};

const URL_CLAIM_TOKEN_TTL_MS = 10 * 60 * 1000;

export type VerifyClaimBody = {
  challengeId?: unknown;
  claimToken?: unknown;
};

export type VerifyClaimRequest = {
  authorizationHeader: string | undefined;
  cookieHeader: string | undefined;
  body: VerifyClaimBody;
};

export type IssueClaimBody = {
  challengeId?: unknown;
};

export type IssueClaimRequest = {
  authorizationHeader: string | undefined;
  cookieHeader: string | undefined;
  body: IssueClaimBody;
};

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

type ClaimChallengeId = Extract<InternalChallengeId, "06" | "08">;

function toClaimChallengeId(challengeId: unknown): ClaimChallengeId | null {
  if (challengeId !== "06" && challengeId !== "08") {
    return null;
  }

  return challengeId;
}

function toClaimFlagId(challengeId: ClaimChallengeId): FlagId {
  return `FLAG-${challengeId}` as FlagId;
}

function normalizeClaimToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const token = value.trim();
  if (token.length < 32 || token.length > 512) {
    return null;
  }

  return token;
}

export class InternalClaimService {
  constructor(
    private readonly store: InternalClaimStore,
    private readonly crypto: InternalClaimCrypto,
    private readonly sessionReader: SessionReader,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly claimFailureRecorder?: ClaimFailureRecorder,
  ) {}

  async verifyClaim(input: VerifyClaimRequest): Promise<{ flagId: FlagId; flag: string }> {
    const internalToken = extractBearerToken(input.authorizationHeader);
    if (!internalToken) {
      throw new UnauthorizedException("Internal service authentication required");
    }

    const challengeId = toClaimChallengeId(input.body?.challengeId);
    if (!challengeId) {
      if (!this.crypto.internalServiceTokenMatches("06", internalToken) && !this.crypto.internalServiceTokenMatches("08", internalToken)) {
        throw new UnauthorizedException("Internal service authentication required");
      }
      const session = await this.authenticateSession(input.cookieHeader);
      await this.recordClaimFailure(session.userId, input.body?.challengeId, undefined, "invalid_input");
      throw new NotFoundException("Claim not found");
    }
    if (!this.crypto.internalServiceTokenMatches(challengeId, internalToken)) {
      throw new UnauthorizedException("Internal service authentication required");
    }

    const session = await this.authenticateSession(input.cookieHeader);
    const flagId = toClaimFlagId(challengeId);
    const claimToken = normalizeClaimToken(input.body.claimToken);
    if (!claimToken) {
      await this.recordClaimFailure(session.userId, input.body.challengeId, flagId, "invalid_input");
      throw new NotFoundException("Claim not found");
    }

    const claim = await this.store.findValidClaim({
      userId: session.userId,
      flagId,
      tokenHash: this.crypto.claimTokenHash(claimToken),
      now: this.clock.now(),
    });
    if (!claim) {
      await this.recordClaimFailure(session.userId, input.body.challengeId, flagId, "not_found");
      throw new NotFoundException("Claim not found");
    }

    return {
      flagId: claim.flagId,
      flag: this.crypto.decryptFlagForInternalApi(claim.flagCiphertext),
    };
  }

  async issueClaim(input: IssueClaimRequest): Promise<{ challengeId: "08"; claimToken: string }> {
    const internalToken = extractBearerToken(input.authorizationHeader);
    if (!internalToken || input.body?.challengeId !== "08") {
      throw new UnauthorizedException("Internal service authentication required");
    }
    if (!this.crypto.internalServiceTokenMatches("08", internalToken)) {
      throw new UnauthorizedException("Internal service authentication required");
    }

    const session = await this.authenticateSession(input.cookieHeader);

    const claimToken = this.crypto.generateOpaqueToken();
    await this.store.createClaimToken({
      userId: session.userId,
      flagId: "FLAG-08",
      tokenHash: this.crypto.claimTokenHash(claimToken),
      expiresAt: new Date(this.clock.now().getTime() + URL_CLAIM_TOKEN_TTL_MS),
    });

    return {
      challengeId: "08",
      claimToken,
    };
  }

  private async authenticateSession(cookieHeader: string | undefined): Promise<AuthenticatedSession> {
    const session = await this.sessionReader.authenticateCookieHeader(cookieHeader);
    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    return session;
  }

  private recordClaimFailure(
    userId: string,
    challengeId: unknown,
    flagId: FlagId | undefined,
    reason: "invalid_input" | "not_found",
  ): Promise<void> {
    if (!this.claimFailureRecorder) {
      return Promise.resolve();
    }

    return this.claimFailureRecorder.recordClaimVerifyFailure({
      userId,
      ...(typeof challengeId === "string" ? { challengeId } : {}),
      ...(flagId ? { flagId } : {}),
      reason,
    });
  }
}
