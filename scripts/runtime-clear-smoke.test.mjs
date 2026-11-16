import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encryptField } from "../packages/config/dist/index.js";
import test from "node:test";
import { buildFinalSubmitAuditQuery, buildFlagQuery, decryptField, parseArgs } from "./runtime-clear-smoke.mjs";

test("runtime-clear-smoke accepts documented pnpm delimiter and clear options", () => {
  const options = parseArgs([
    "--",
    "--base-url",
    "http://127.0.0.1/",
    "--student-id",
    "9101234",
    "--password",
    "ClearSmokePassword123",
    "--runtime-secrets-dir",
    "/tmp/runtime-secrets",
  ]);

  assert.equal(options.baseUrl, "http://127.0.0.1");
  assert.equal(options.studentId, "9101234");
  assert.equal(options.password, "ClearSmokePassword123");
  assert.equal(options.runtimeSecretsDir, "/tmp/runtime-secrets");
});

test("runtime-clear-smoke decrypts the exact AES-GCM bundles issued by the backend", () => {
  const key = randomBytes(32).toString("base64");
  const bundle = encryptField("KDUCTF{fixture_flag}", key, "flag-v1");

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
