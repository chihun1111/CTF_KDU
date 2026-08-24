import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ClearCertificateService, type ClearCertificateStore } from "./clear-certificate.service.js";

function createStore(): ClearCertificateStore {
  return {
    async consumeClearViewToken(input) {
      if (input.userId !== "user-1" || input.tokenHash !== "clear-token-hash") {
        return null;
      }

      return {
        studentIdCiphertext: {
          alg: "AES-256-GCM",
          keyVersion: "student-id-v1",
          iv: "iv",
          ciphertext: "ciphertext",
          tag: "tag",
        },
        clearedAt: new Date("2026-05-07T12:00:00.000Z"),
        clearReceiptCode: "CLR-8F3K2A",
      };
    },
  };
}

test("ClearCertificateService consumes one clear token and returns certificate data", async () => {
  const service = new ClearCertificateService(
    createStore(),
    {
      clearViewTokenHash: () => "clear-token-hash",
      decryptStudentIdForClearCertificate: () => "2622022",
    },
    {
      buildExpiredClearCookie: () => "ctf_clear_once=; Max-Age=0",
    },
  );

  const result = await service.consume("user-1", "ctf_clear_once=clear-token; ctf_session=session-token");

  assert.deepEqual(result, {
    setCookie: "ctf_clear_once=; Max-Age=0",
    body: {
      studentId: "2622022",
      clearedAt: "2026-05-07T12:00:00.000Z",
      clearReceiptCode: "CLR-8F3K2A",
      message: "8개 플래그를 모두 제출했습니다.",
    },
  });
  assert.equal(JSON.stringify(result).includes("clear-token"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
});

test("ClearCertificateService rejects missing, consumed, expired, or foreign clear tokens", async () => {
  const service = new ClearCertificateService(
    {
      async consumeClearViewToken() {
        return null;
      },
    },
    {
      clearViewTokenHash: () => "missing-hash",
      decryptStudentIdForClearCertificate: () => "2622022",
    },
    {
      buildExpiredClearCookie: () => "ctf_clear_once=; Max-Age=0",
    },
  );

  await assert.rejects(() => service.consume("user-1", "ctf_session=session-token"), ForbiddenException);
  await assert.rejects(() => service.consume("user-1", "ctf_clear_once=wrong"), ForbiddenException);
});
