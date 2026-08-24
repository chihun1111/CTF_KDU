import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { isInternalChallengeId, type EncryptedFieldBundle, type InternalChallengeId } from "@campus-ctf/config";
import type { CryptoService } from "../crypto/crypto.service.js";
import type { AuthenticatedSession, SessionAuthService } from "../auth/session-auth.service.js";
import type { FlagId } from "../challenges/challenges.service.js";

export type UserChallengeFlagRecord = {
  flagId: FlagId;
  flagCiphertext: EncryptedFieldBundle;
};

export type InternalFlagStore = {
  findUserChallengeFlag(userId: string, flagId: FlagId): Promise<UserChallengeFlagRecord | null>;
};

type InternalFlagCrypto = Pick<CryptoService, "decryptFlagForInternalApi" | "internalServiceTokenMatches">;
type SessionReader = Pick<SessionAuthService, "authenticateCookieHeader">;

export type InternalFlagRequest = {
  authorizationHeader: string | undefined;
  cookieHeader: string | undefined;
  challengeId: string;
};

function toFlagId(challengeId: string): { challengeId: InternalChallengeId; flagId: FlagId } | null {
  return isInternalChallengeId(challengeId)
    ? { challengeId, flagId: `FLAG-${challengeId}` as FlagId }
    : null;
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export class InternalFlagService {
  constructor(
    private readonly store: InternalFlagStore,
    private readonly crypto: InternalFlagCrypto,
    private readonly sessionReader: SessionReader,
  ) {}

  async getChallengeFlag(input: InternalFlagRequest): Promise<{ flagId: FlagId; flag: string }> {
    const requested = toFlagId(input.challengeId);
    const token = extractBearerToken(input.authorizationHeader);
    if (!requested) {
      throw new NotFoundException("Challenge not found");
    }
    if (!token || !this.crypto.internalServiceTokenMatches(requested.challengeId, token)) {
      throw new UnauthorizedException("Internal service authentication required");
    }

    const session = await this.authenticateSession(input.cookieHeader);

    const record = await this.store.findUserChallengeFlag(session.userId, requested.flagId);
    if (!record) {
      throw new NotFoundException("Challenge not found");
    }

    return {
      flagId: record.flagId,
      flag: this.crypto.decryptFlagForInternalApi(record.flagCiphertext),
    };
  }

  private async authenticateSession(cookieHeader: string | undefined): Promise<AuthenticatedSession> {
    const session = await this.sessionReader.authenticateCookieHeader(cookieHeader);
    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    return session;
  }
}
