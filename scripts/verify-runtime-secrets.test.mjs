import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const verifierPath = path.join(repoRoot, "scripts/verify-runtime-secrets.mjs");
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

function runVerifier(args = []) {
  try {
    const output = execFileSync(process.execPath, [verifierPath, ...args], { encoding: "utf8", stdio: "pipe" });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function createSecretDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-secrets-"));
  const aes = Buffer.alloc(32, 7).toString("base64");
  for (const file of secretFiles) {
    const body = file.endsWith("encryption_key") ? aes : `${file}-value-with-at-least-32-bytes`;
    const filePath = path.join(dir, file);
    writeFileSync(filePath, `${body}\n`);
    chmodSync(filePath, 0o600);
  }
  return dir;
}

test("verify-runtime-secrets accepts complete owner-readable runtime secret files", () => {
  const dir = createSecretDir();
  const result = runVerifier(["--dir", dir]);

  assert.equal(result.status, 0);
  assert.match(result.output, /Runtime secret verification passed/);
});

test("verify-runtime-secrets rejects missing, weak, and over-readable secret files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-secrets-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "student_id_encryption_key"), "not-a-key\n");
  chmodSync(path.join(dir, "student_id_encryption_key"), 0o644);

  const result = runVerifier(["--dir", dir]);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /base64-encoded 32-byte AES key/);
  assert.match(result.output, /group\/world-readable/);
  assert.match(result.output, /Missing runtime secret file: session_secret/);
});
