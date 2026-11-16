import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const verifierPath = path.join(repoRoot, "scripts/verify-sensitive-artifacts.mjs");

function writeFixtureFile(root, filePath, contents = "") {
  const fullPath = path.join(root, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function runVerifier(cwd, args = []) {
  try {
    const output = execFileSync(process.execPath, [verifierPath, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("verify-sensitive-artifacts passes clean frontend artifacts and optional runtime scans", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-sensitive-"));
  writeFixtureFile(root, "apps/frontend/app/page.tsx", "export default function Page() { return 'ok'; }\n");
  writeFixtureFile(root, "apps/frontend/.next/static/chunk.js", "console.log('ok');\n");
  writeFixtureFile(root, "runtime/backend.log", "admin read resource=participants\n");
  writeFixtureFile(root, "runtime/db.dump", "INSERT INTO sessions(session_hash) VALUES ('hash');\n");

  const result = runVerifier(root, ["--backend-log", "runtime/backend.log", "--db-dump", "runtime/db.dump"]);

  assert.equal(result.status, 0);
  assert.match(result.output, /Sensitive artifact verification passed/);
});

test("verify-sensitive-artifacts rejects forbidden frontend and runtime material", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-sensitive-"));
  writeFixtureFile(
    root,
    "apps/frontend/app/page.tsx",
    "const marker = 'KDUCTF{leak}'; const claimToken = 'opaque'; const artifactHref = '/legacy'; const legacy = '?userId=raw'; const userId = 'raw';\n",
  );
  writeFixtureFile(root, "apps/frontend/.next/server/chunks/stale.js", "const userId = 'legacy-build';\n");
  writeFixtureFile(root, "runtime/backend.log", "Cookie: ctf_session=opaque\n");

  const result = runVerifier(root, ["--backend-log", "runtime/backend.log"]);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /flag literal/);
  assert.match(result.output, /session cookie material/);
  assert.match(result.output, /claim token material/);
  assert.match(result.output, /legacy artifact link/);
  assert.match(result.output, /raw admin identity or legacy metric field/);
  assert.match(result.output, /query identity material/);
});

test("verify-sensitive-artifacts allows only the exact public ellipsis example after constant folding", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-sensitive-"));
  writeFixtureFile(root, "apps/frontend/.next/static/chunk.js", "const example = 'KDUCTF{...}';\n");
  assert.equal(runVerifier(root).status, 0);
});

test("an allowed example cannot hide an adjacent real-shaped flag or a longer payload", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-sensitive-"));
  for (const body of ["KDUCTF{...} KDUCTF{leak}", "KDUCTF{...suffix}", "KDUCTF{....}"]) {
    writeFixtureFile(root, "apps/frontend/.next/static/chunk.js", body);
    const result = runVerifier(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /flag literal/);
  }
});
