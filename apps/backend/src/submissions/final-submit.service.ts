import { BadRequestException } from "@nestjs/common";
import type { CryptoService } from "../crypto/crypto.service.js";
import type { FinalSubmitAuditInput } from "../audit/audit.service.js";

export const FINAL_FLAG_IDS = [
  "FLAG-01",
  "FLAG-02",
  "FLAG-03",
  "FLAG-04",
  "FLAG-05",
  "FLAG-06",
  "FLAG-07",
  "FLAG-08",
] as const;

export type FinalFlagId = (typeof FINAL_FLAG_IDS)[number];

export type FinalSubmitInput = {
  flagsByFlagId?: Record<string, unknown>;
};

export type UserChallengeFlagForSubmit = {
  flagId: FinalFlagId;
  challengeId: string;
  flagHash: string;
};

export type FinalSubmitTransaction = {
  listUserChallengeFlags(userId: string): Promise<UserChallengeFlagForSubmit[]>;
  createFinalSubmission(input: {
    userId: string;
    submittedHashBundle: Partial<Record<FinalFlagId, string>>;
    correctCount: number;
    isClear: boolean;
  }): Promise<{ id: string }>;
  createFinalSubmissionResults(input: {
    finalSubmissionId: string;
    userId: string;
    results: Array<{
      flagId: FinalFlagId;
      challengeId: string;
      submittedFlagHash: string;
      isCorrect: boolean;
    }>;
  }): Promise<void>;
  ensureClear(input: { userId: string; clearReceiptCode: string }): Promise<void>;
  createClearViewToken(input: {
    userId: string;
    finalSubmissionId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  recordFinalSubmitAudit(input: FinalSubmitAuditInput): Promise<void>;
};

export type FinalSubmitStore = {
  transaction<T>(callback: (tx: FinalSubmitTransaction) => Promise<T>): Promise<T>;
};

type FinalSubmitCrypto = Pick<
  CryptoService,
  "clearViewTokenHash" | "flagHash" | "generateOpaqueToken" | "timingSafeHashEqual"
>;

type ClearCookieBuilder = {
  buildClearCookie(clearToken: string, maxAgeSeconds: number): string;
};

type FinalSubmitBody = {
  cleared: boolean;
  correctCount: number;
  requiredCount: number;
  resultsByFlagId: Partial<Record<FinalFlagId, { correct: boolean }>>;
  clearRedirectTo?: "/clear";
  message: string;
};

const FLAG_PATTERN = new RegExp("^KDUCTF" + "\\{[^\\r\\n{}]{1,200}\\}$");
const CLEAR_COOKIE_MAX_AGE_SECONDS = 300;

function assertFinalFlagId(value: string): asserts value is FinalFlagId {
  if (!(FINAL_FLAG_IDS as readonly string[]).includes(value)) {
    throw new BadRequestException("Invalid final submission");
  }
}

export class FinalSubmitService {
  constructor(
    private readonly store: FinalSubmitStore,
    private readonly crypto: FinalSubmitCrypto,
    private readonly clearCookie: ClearCookieBuilder,
  ) {}

  async submit(userId: string, input: FinalSubmitInput): Promise<{ body: FinalSubmitBody; setCookie?: string }> {
    const submittedFlags = this.parseFlags(input);
    const submittedCount = Object.keys(submittedFlags).length;

    const result = await this.store.transaction(async (tx) => {
      const challengeFlags = await tx.listUserChallengeFlags(userId);
      if (challengeFlags.length !== FINAL_FLAG_IDS.length) {
        throw new BadRequestException("Invalid final submission");
      }

      const expectedByFlagId = new Map(challengeFlags.map((row) => [row.flagId, row]));
      const submittedFlagIds = FINAL_FLAG_IDS.filter((flagId) => submittedFlags[flagId] !== undefined);
      const submittedHashBundle: Partial<Record<FinalFlagId, string>> = {};
      const resultByFlagId = new Map<FinalFlagId, {
        flagId: FinalFlagId;
        challengeId: string;
        submittedFlagHash: string;
        isCorrect: boolean;
      }>();
      const matchedFlagIds = new Set<FinalFlagId>();
      for (const submittedSlotFlagId of submittedFlagIds) {
        const submittedFlag = submittedFlags[submittedSlotFlagId];
        if (!submittedFlag) {
          throw new BadRequestException("Invalid final submission");
        }
        const submittedFlagHash = this.crypto.flagHash(submittedFlag);

        const matchedExpected = challengeFlags.find(
          (expected) =>
            !matchedFlagIds.has(expected.flagId) &&
            this.crypto.timingSafeHashEqual(submittedFlagHash, expected.flagHash),
        );
        if (matchedExpected) {
          matchedFlagIds.add(matchedExpected.flagId);
          submittedHashBundle[matchedExpected.flagId] = submittedFlagHash;
          resultByFlagId.set(matchedExpected.flagId, {
            flagId: matchedExpected.flagId,
            challengeId: matchedExpected.challengeId,
            submittedFlagHash,
            isCorrect: true,
          });
          continue;
        }

        const expectedForSubmittedSlot = expectedByFlagId.get(submittedSlotFlagId);
        if (!expectedForSubmittedSlot) {
          throw new BadRequestException("Invalid final submission");
        }
        if (!resultByFlagId.has(submittedSlotFlagId)) {
          submittedHashBundle[submittedSlotFlagId] = submittedFlagHash;
          resultByFlagId.set(submittedSlotFlagId, {
            flagId: submittedSlotFlagId,
            challengeId: expectedForSubmittedSlot.challengeId,
            submittedFlagHash,
            isCorrect: false,
          });
        }
      }
      const results = [...resultByFlagId.values()];
      const correctCount = results.filter((result) => result.isCorrect).length;
      const isClear = results.length === FINAL_FLAG_IDS.length && correctCount === FINAL_FLAG_IDS.length;
      const submission = await tx.createFinalSubmission({
        userId,
        submittedHashBundle,
        correctCount,
        isClear,
      });
      await tx.createFinalSubmissionResults({
        finalSubmissionId: submission.id,
        userId,
        results,
      });
      await tx.recordFinalSubmitAudit({
        userId,
        correctCount,
        requiredCount: FINAL_FLAG_IDS.length,
        submittedCount,
        cleared: isClear,
      });

      const body: FinalSubmitBody = {
        cleared: isClear,
        correctCount,
        requiredCount: FINAL_FLAG_IDS.length,
        resultsByFlagId: Object.fromEntries(results.map((result) => [result.flagId, { correct: result.isCorrect }])) as Partial<Record<
          FinalFlagId,
          { correct: boolean }
        >>,
        message: isClear
          ? "8개 플래그가 모두 맞았습니다."
          : `현재 8개 중 ${correctCount}개가 맞았습니다.`,
      };

      if (!isClear) {
        return { body };
      }

      await tx.ensureClear({
        userId,
        clearReceiptCode: this.crypto.generateOpaqueToken().slice(0, 16),
      });
      const clearToken = this.crypto.generateOpaqueToken();
      await tx.createClearViewToken({
        userId,
        finalSubmissionId: submission.id,
        tokenHash: this.crypto.clearViewTokenHash(clearToken),
        expiresAt: new Date(Date.now() + CLEAR_COOKIE_MAX_AGE_SECONDS * 1000),
      });

      return {
        body: {
          ...body,
          clearRedirectTo: "/clear" as const,
        },
        setCookie: this.clearCookie.buildClearCookie(clearToken, CLEAR_COOKIE_MAX_AGE_SECONDS),
      };
    });

    return result;
  }

  private parseFlags(input: FinalSubmitInput): Partial<Record<FinalFlagId, string>> {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      !input.flagsByFlagId || typeof input.flagsByFlagId !== "object" || Array.isArray(input.flagsByFlagId)) {
      throw new BadRequestException("Invalid final submission");
    }

    const parsed: Partial<Record<FinalFlagId, string>> = {};
    for (const [rawFlagId, value] of Object.entries(input.flagsByFlagId)) {
      assertFinalFlagId(rawFlagId);
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value !== "string") {
        throw new BadRequestException("Invalid final submission");
      }

      const normalized = value.trim();
      if (!normalized) {
        continue;
      }
      if (!FLAG_PATTERN.test(normalized)) {
        throw new BadRequestException("Invalid final submission");
      }

      parsed[rawFlagId] = normalized;
    }

    if (Object.keys(parsed).length === 0) {
      throw new BadRequestException("Invalid final submission");
    }

    return parsed;
  }
}
