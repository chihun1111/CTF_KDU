import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { encryptField, decryptField, hmacLookupHash, loadRuntimeSecrets, timingSafeHashEqual } from "./index.js";

function productionEnvironment(): Record<string, string> {
  const names = ["SESSION_SECRET", "FLAG_ENCRYPTION_KEY", "FLAG_HASH_PEPPER", "STUDENT_ID_ENCRYPTION_KEY", "STUDENT_ID_HASH_PEPPER", "CLEAR_VIEW_TOKEN_SECRET", "CLAIM_TOKEN_SECRET", ...Array.from({ length: 8 }, (_, i) => `INTERNAL_SERVICE_TOKEN_0${i + 1}`)];
  return { NODE_ENV: "production", ...Object.fromEntries(names.map((name, i) => [name, Buffer.alloc(32, i + 1).toString("base64")])) };
}

test("production startup rejects weak, reused or malformed secrets without revealing values", () => {
  const env = productionEnvironment();
  assert.doesNotThrow(() => loadRuntimeSecrets(env));
  assert.throws(() => loadRuntimeSecrets({ ...env, SESSION_SECRET: "weak" }), /SESSION_SECRET must contain/);
  assert.throws(() => loadRuntimeSecrets({ ...env, INTERNAL_SERVICE_TOKEN_02: env.INTERNAL_SERVICE_TOKEN_01! }), /INTERNAL_SERVICE_TOKEN_02 must be unique/);
  assert.throws(() => loadRuntimeSecrets({ ...env, FLAG_ENCRYPTION_KEY: "not-base64".repeat(8) }), /FLAG_ENCRYPTION_KEY must be a base64/);
});

test("hash comparison rejects malformed and truncated hex values", () => {
  const digest = hmacLookupHash("test-key", "value");
  assert.equal(timingSafeHashEqual(digest, digest), true);
  assert.equal(timingSafeHashEqual(digest, digest.toUpperCase()), true);
  assert.equal(timingSafeHashEqual(digest, hmacLookupHash("test-key", "other")), false);
  for (const invalid of ["", "zz", "a", `${digest}z`, `${digest}00`, digest.slice(2)]) {
    assert.equal(timingSafeHashEqual(invalid, invalid), false);
    assert.equal(timingSafeHashEqual(digest, invalid), false);
  }
});

test("encrypted fields round-trip Korean text and reject tampering or another key", () => {
  const value = encryptField("교내 테스트 데이터", "test-key", "v1");
  assert.equal(decryptField(value, "test-key"), "교내 테스트 데이터");
  assert.notEqual(encryptField("교내 테스트 데이터", "test-key", "v1").iv, value.iv);
  assert.throws(() => decryptField(value, "other-key"));
  const ciphertext = Buffer.from(value.ciphertext, "base64");
  ciphertext[0] = ciphertext[0]! ^ 1;
  assert.throws(() => decryptField({ ...value, ciphertext: ciphertext.toString("base64") }, "test-key"));
});

test("loadRuntimeSecrets prefers mounted secret files over direct environment values", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "campus-ctf-config-"));
  const sessionSecretFile = path.join(directory, "session_secret");
  writeFileSync(sessionSecretFile, "session-secret-from-file\n", { mode: 0o600 });

  const secrets = loadRuntimeSecrets({
    SESSION_SECRET: "session-secret-from-environment",
    SESSION_SECRET_FILE: sessionSecretFile,
    FLAG_ENCRYPTION_KEY: "flag-encryption-key-from-environment",
    FLAG_HASH_PEPPER: "flag-hash-pepper-from-environment",
    STUDENT_ID_ENCRYPTION_KEY: "student-id-encryption-key-from-environment",
    STUDENT_ID_HASH_PEPPER: "student-id-hash-pepper-from-environment",
    CLEAR_VIEW_TOKEN_SECRET: "clear-view-token-secret-from-environment",
    CLAIM_TOKEN_SECRET: "claim-token-secret-from-environment",
    INTERNAL_SERVICE_TOKEN_01: "internal-service-token-01-from-environment",
    INTERNAL_SERVICE_TOKEN_02: "internal-service-token-02-from-environment",
    INTERNAL_SERVICE_TOKEN_03: "internal-service-token-03-from-environment",
    INTERNAL_SERVICE_TOKEN_04: "internal-service-token-04-from-environment",
    INTERNAL_SERVICE_TOKEN_05: "internal-service-token-05-from-environment",
    INTERNAL_SERVICE_TOKEN_06: "internal-service-token-06-from-environment",
    INTERNAL_SERVICE_TOKEN_07: "internal-service-token-07-from-environment",
    INTERNAL_SERVICE_TOKEN_08: "internal-service-token-08-from-environment",
  });

  assert.equal(secrets.SESSION_SECRET, "session-secret-from-file");
  assert.equal(secrets.INTERNAL_SERVICE_TOKENS["08"], "internal-service-token-08-from-environment");
});
