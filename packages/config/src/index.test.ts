import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadRuntimeSecrets } from "./index.js";

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
