import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const generatorPath = path.join(repoRoot, "scripts/generate-runtime-secrets.mjs");
const secretFiles = [
  "student_id_encryption_key",
  "student_id_hash_pepper",
  "flag_encryption_key",
  "flag_hash_pepper",
  "session_secret",
  "clear_view_token_secret",
  "claim_token_secret",
  "internal_service_token_01",
  "internal_service_token_02",
  "internal_service_token_03",
  "internal_service_token_04",
  "internal_service_token_05",
  "internal_service_token_06",
  "internal_service_token_07",
  "internal_service_token_08",
  "postgres_password",
];

function runGenerator(args = []) {
  return execFileSync(process.execPath, [generatorPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function isOwnerOnly(mode) {
  return (mode & 0o077) === 0;
}

test("generate-runtime-secrets creates all runtime secret files without printing values", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-generated-secrets-"));

  const output = runGenerator(["--dir", dir]);

  assert.match(output, /Generated 16 runtime secret files/);
  assert.doesNotMatch(output, /[A-Za-z0-9+/]{32,}={0,2}/);
  assert.ok(isOwnerOnly(statSync(dir).mode));
  for (const file of secretFiles) {
    const filePath = path.join(dir, file);
    assert.ok(existsSync(filePath), `${file} should exist`);
    assert.ok(isOwnerOnly(statSync(filePath).mode), `${file} should be owner-only`);
    const value = readFileSync(filePath, "utf8").trim();
    assert.ok(value.length >= 32, `${file} should contain strong random material`);
    if (file.endsWith("encryption_key")) {
      assert.equal(Buffer.from(value, "base64").byteLength, 32);
    }
  }
});

test("generate-runtime-secrets preserves existing files unless --force is used", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-generated-secrets-"));
  const existingPath = path.join(dir, "session_secret");
  writeFileSync(existingPath, "existing-session-secret-with-32-bytes\n", { mode: 0o600 });
  chmodSync(existingPath, 0o600);

  runGenerator(["--dir", dir]);
  assert.equal(readFileSync(existingPath, "utf8"), "existing-session-secret-with-32-bytes\n");

  runGenerator(["--dir", dir, "--force"]);
  assert.notEqual(readFileSync(existingPath, "utf8"), "existing-session-secret-with-32-bytes\n");
});
