import { ForbiddenException } from "@nestjs/common";
import { readTokenCookie } from "../auth/read-token-cookie.js";
import type { EncryptedFieldBundle } from "@campus-ctf/config";
import type { CryptoService } from "../crypto/crypto.service.js";
import type { ClearCookieService } from "./clear-cookie.service.js";

export type ClearCertificateRecord = {
  studentIdCiphertext: EncryptedFieldBundle;
  clearedAt: Date;
  clearReceiptCode: string;
};

export type ConsumeClearViewTokenInput = {
  userId: string;
  tokenHash: string;
  now: Date;
};

export type ClearCertificateStore = {
  consumeClearViewToken(input: ConsumeClearViewTokenInput): Promise<ClearCertificateRecord | null>;
};

type ClearCertificateCrypto = Pick<CryptoService, "clearViewTokenHash" | "decryptStudentIdForClearCertificate">;
type ClearCookieExpiry = Pick<ClearCookieService, "buildExpiredClearCookie">;

export class ClearCertificateService {
  constructor(
    private readonly store: ClearCertificateStore,
    private readonly crypto: ClearCertificateCrypto,
    private readonly clearCookie: ClearCookieExpiry,
  ) {}

  async consume(
    userId: string,
    cookieHeader: string | undefined,
  ): Promise<{
    setCookie: string;
    body: { studentId: string; clearedAt: string; clearReceiptCode: string; message: string };
  }> {
    const clearToken = readTokenCookie(cookieHeader, "ctf_clear_once");
    if (!clearToken) {
      throw new ForbiddenException("Clear certificate unavailable");
    }

    const record = await this.store.consumeClearViewToken({
      userId,
      tokenHash: this.crypto.clearViewTokenHash(clearToken),
      now: new Date(),
    });
    if (!record) {
      throw new ForbiddenException("Clear certificate unavailable");
    }

    return {
      setCookie: this.clearCookie.buildExpiredClearCookie(),
      body: {
        studentId: this.crypto.decryptStudentIdForClearCertificate(record.studentIdCiphertext),
        clearedAt: record.clearedAt.toISOString(),
        clearReceiptCode: record.clearReceiptCode,
        message: "8개 플래그를 모두 제출했습니다.",
      },
    };
  }
}
