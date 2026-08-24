import assert from "node:assert/strict";
import test from "node:test";
import { decryptField, hmacLookupHash, type RuntimeSecrets } from "@campus-ctf/config";
import { CryptoService } from "./crypto.service.js";

const studentKey = Buffer.alloc(32, 3);
const flagKey = Buffer.alloc(32, 5);

function cryptoService(): CryptoService {
  const secrets: RuntimeSecrets = {
    STUDENT_ID_ENCRYPTION_KEY: studentKey,
    STUDENT_ID_HASH_PEPPER: "student-pepper-value-with-at-least-32-bytes",
    FLAG_ENCRYPTION_KEY: flagKey,
    FLAG_HASH_PEPPER: "flag-pepper-value-with-at-least-32-bytes",
    SESSION_SECRET: "session-secret-value-with-at-least-32-bytes",
    CLEAR_VIEW_TOKEN_SECRET: "clear-token-secret-with-at-least-32-bytes",
    CLAIM_TOKEN_SECRET: "claim-token-secret-with-at-least-32-bytes",
    INTERNAL_SERVICE_TOKENS: {
      "01": "internal-service-token-01-with-at-least-32-bytes",
      "02": "internal-service-token-02-with-at-least-32-bytes",
      "03": "internal-service-token-03-with-at-least-32-bytes",
      "04": "internal-service-token-04-with-at-least-32-bytes",
      "05": "internal-service-token-05-with-at-least-32-bytes",
      "06": "internal-service-token-06-with-at-least-32-bytes",
      "07": "internal-service-token-07-with-at-least-32-bytes",
      "08": "internal-service-token-08-with-at-least-32-bytes",
    },
  };

  return new CryptoService({
    getRuntimeSecrets: () => secrets,
  });
}

test("CryptoService prepares student id storage without exposing plaintext", () => {
  const service = cryptoService();
  const result = service.prepareStudentIdForStorage("2622022");

  assert.equal(result.keyVersion, "student-id-v1");
  assert.equal(result.hash, hmacLookupHash("student-pepper-value-with-at-least-32-bytes", "2622022"));
  assert.equal(decryptField(result.ciphertext, studentKey), "2622022");
  assert.notEqual(JSON.stringify(result.ciphertext).includes("2622022"), true);
});

test("CryptoService decrypts student id only for clear certificate rendering", () => {
  const service = cryptoService();
  const result = service.prepareStudentIdForStorage("2622022");

  assert.equal(service.decryptStudentIdForClearCertificate(result.ciphertext), "2622022");
});

test("CryptoService prepares flag storage with normalized HMAC and encrypted bundle", () => {
  const service = cryptoService();
  const result = service.prepareFlagForStorage("  KDUCTF" + "{ABC}\n");

  assert.equal(result.keyVersion, "flag-v1");
  assert.equal(result.hash, hmacLookupHash("flag-pepper-value-with-at-least-32-bytes", "KDUCTF" + "{ABC}"));
  assert.equal(decryptField(result.ciphertext, flagKey), "KDUCTF" + "{ABC}");
});

test("CryptoService decrypts flags only through the backend secret boundary", () => {
  const service = cryptoService();
  const storage = service.prepareFlagForStorage("KDUCTF" + "{INTERNAL}");

  assert.equal(service.decryptFlagForInternalApi(storage.ciphertext), "KDUCTF" + "{INTERNAL}");
});

test("CryptoService verifies only the token assigned to the requested challenge", () => {
  const service = cryptoService();

  assert.equal(service.internalServiceTokenMatches("01", "internal-service-token-01-with-at-least-32-bytes"), true);
  assert.equal(service.internalServiceTokenMatches("02", "internal-service-token-01-with-at-least-32-bytes"), false);
  assert.equal(service.internalServiceTokenMatches("01", "internal-service-token-01-with-at-least-32-bytez"), false);
  assert.equal(service.internalServiceTokenMatches("01", ""), false);
});

test("CryptoService hashes claim tokens with the dedicated claim token secret", () => {
  const service = cryptoService();

  assert.equal(
    service.claimTokenHash("claim-token-value"),
    hmacLookupHash("claim-token-secret-with-at-least-32-bytes", "claim-token-value"),
  );
  assert.notEqual(service.claimTokenHash("claim-token-value"), service.sessionHash("claim-token-value"));
});

test("CryptoService hashes request metadata before rate limit storage", () => {
  const service = cryptoService();

  assert.equal(
    service.requestMetadataHash("203.0.113.10"),
    hmacLookupHash("session-secret-value-with-at-least-32-bytes", "203.0.113.10"),
  );
});
