import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import { buildFinalSubmitAuditQuery, buildFlagQuery, decryptField, parseArgs } from "./runtime-clear-smoke.mjs";

function encryptFixture(plaintext, key, keyVersion = "flag-v1") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(keyVersion, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    alg: "AES-256-GCM",
    keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

test("runtime-clear-smoke accepts documented pnpm delimiter and clear options", () => {
  const options = parseArgs([
    "--",
    "--base-url",
    "http://127.0.0.1/",
    "--student-id",
    "9101234",
    "--password",
    "ClearSmoke-password",
    "--runtime-secrets-dir",
    "/tmp/runtime-secrets",
  ]);

  assert.equal(options.baseUrl, "http://127.0.0.1");
  assert.equal(options.studentId, "9101234");
  assert.equal(options.password, "ClearSmoke-password");
  assert.equal(options.runtimeSecretsDir, "/tmp/runtime-secrets");
});

test("runtime-clear-smoke decrypts AES-GCM flag bundles", () => {
  const key = randomBytes(32);
  const bundle = encryptFixture("KDUCTF{fixture_flag}", key);

  assert.equal(decryptField(bundle, key), "KDUCTF{fixture_flag}");
});

test("runtime-clear-smoke builds a constrained lookup query from a hex student hash", () => {
  const query = buildFlagQuery("a".repeat(64));

  assert.match(query, /where u\.student_id_hash = 'a{64}'/);
  assert.match(query, /jsonb_object_agg/);
  assert.throws(() => buildFlagQuery("not-a-hash"), /student id hash/);
});

test("runtime-clear-smoke builds a constrained final submit audit query from a hex student hash", () => {
  const query = buildFinalSubmitAuditQuery("b".repeat(64));

  assert.match(query, /audit_logs/);
  assert.match(query, /a\.action = 'FINAL_SUBMIT'/);
  assert.match(query, /where u\.student_id_hash = 'b{64}'/);
  assert.throws(() => buildFinalSubmitAuditQuery("not-a-hash"), /student id hash/);
});

test("runtime-clear-smoke CLI invokes main for direct script execution", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/runtime-clear-smoke.mjs", "--student-id", "not-valid"], { encoding: "utf8" }),
    (error) => {
      assert.match(error.stderr, /--student-id must be exactly 7 digits/);
      return true;
    },
  );
});
