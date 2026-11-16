import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { FLAG_IDS } from "@campus-ctf/shared";
import { parseRegisterRequest, type RegisterRequestDto } from "./dto/auth.dto.js";
import type { EncryptedStorageValue } from "../crypto/crypto.service.js";
import type { ChallengeForFlagIssuance, IssuedChallengeFlagRecord } from "../flags/flag-issuance.service.js";

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export type RegistrationTransaction = {
  findUserByStudentIdHash(studentIdHash: string): Promise<{ id: string } | null>;
  createUser(input: {
    studentIdCiphertext: EncryptedStorageValue["ciphertext"];
    studentIdKeyVersion: string;
    studentIdHash: string;
    passwordHash: string;
  }): Promise<{ id: string }>;
  recordCookieConsent(input: {
    userId: string;
    consentVersion: string;
    requiredLoggingAccepted: boolean;
    analyticsLoggingAccepted: boolean;
    cookieAccepted: boolean;
    ipHash: string;
    userAgentHash: string;
  }): Promise<void>;
  listActiveChallenges(): Promise<readonly ChallengeForFlagIssuance[]>;
  createChallengeFlags(userId: string, records: readonly IssuedChallengeFlagRecord[]): Promise<void>;
  createSession(input: {
    userId: string;
    sessionHash: string;
    expiresAt: Date;
    lastSeenAt: Date;
  }): Promise<{ id: string }>;
};

export type RegistrationStore = {
  transaction<T>(callback: (tx: RegistrationTransaction) => Promise<T>): Promise<T>;
};

export type RegistrationResult = {
  body: { ok: true };
  setCookie: string;
};

export type RegistrationInput = {
  input: RegisterRequestDto;
  ipHash: string;
  userAgentHash: string;
};

type RegistrationCrypto = {
  prepareStudentIdForStorage(studentId: string): EncryptedStorageValue;
  generateOpaqueToken(): string;
  sessionHash(sessionToken: string): string;
};

type PasswordHasher = {
  hashPassword(password: string): Promise<string>;
};

type FlagIssuer = {
  issueChallengeFlagsForUser(challenges: readonly ChallengeForFlagIssuance[]): IssuedChallengeFlagRecord[];
};

type SessionCookieBuilder = {
  buildSessionCookie(sessionToken: string, maxAgeSeconds: number): string;
};

export class AuthRegistrationService {
  constructor(
    private readonly store: RegistrationStore,
    private readonly crypto: RegistrationCrypto,
    private readonly passwordHasher: PasswordHasher,
    private readonly flagIssuer: FlagIssuer,
    private readonly sessionCookie: SessionCookieBuilder,
  ) {}

  async register(registration: RegistrationInput): Promise<RegistrationResult> {
    const input = parseRegisterRequest(registration?.input);
    const sessionToken = this.crypto.generateOpaqueToken();
    const sessionHash = this.crypto.sessionHash(sessionToken);
    const studentIdStorage = this.crypto.prepareStudentIdForStorage(input.studentId);
    const passwordHash = await this.passwordHasher.hashPassword(input.password);
    const now = new Date();

    await this.store.transaction(async (tx) => {
      const existingUser = await tx.findUserByStudentIdHash(studentIdStorage.hash);
      if (existingUser) {
        throw new ConflictException("Registration failed");
      }

      const user = await tx.createUser({
        studentIdCiphertext: studentIdStorage.ciphertext,
        studentIdKeyVersion: studentIdStorage.keyVersion,
        studentIdHash: studentIdStorage.hash,
        passwordHash,
      });

      await tx.recordCookieConsent({
        userId: user.id,
        consentVersion: input.consent.consentVersion,
        requiredLoggingAccepted: input.consent.requiredLoggingAccepted,
        analyticsLoggingAccepted: input.consent.analyticsLoggingAccepted ?? false,
        cookieAccepted: input.consent.cookieAccepted,
        ipHash: registration.ipHash,
        userAgentHash: registration.userAgentHash,
      });

      const challenges = await tx.listActiveChallenges();
      if (
        challenges.length !== FLAG_IDS.length ||
        new Set(challenges.map((challenge) => challenge.id)).size !== FLAG_IDS.length ||
        !FLAG_IDS.every((flagId) => challenges.some((challenge) => challenge.flagId === flagId))
      ) {
        // The transaction rolls back user and consent writes when seeding is incomplete.
        throw new ServiceUnavailableException("Registration is temporarily unavailable");
      }
      await tx.createChallengeFlags(user.id, this.flagIssuer.issueChallengeFlagsForUser(challenges));
      await tx.createSession({
        userId: user.id,
        sessionHash,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
      });
    });

    return {
      body: { ok: true },
      setCookie: this.sessionCookie.buildSessionCookie(sessionToken, SESSION_MAX_AGE_SECONDS),
    };
  }
}
