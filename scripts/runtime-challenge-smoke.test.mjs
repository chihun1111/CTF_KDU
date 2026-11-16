import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  forgeVaultTicket,
  extractFlag,
  getCookieValue,
  mergeCookies,
  parseArgs,
  readfileSearchPath,
  runAdminBundle,
  setCookieValue,
  sha256Padding,
  sqliteShellSearchPath,
  sqliSearchPath,
  sqliSecretPostPath,
} from "./runtime-challenge-smoke.mjs";

const FIXTURE_FLAG = `KDUCTF{${"a".repeat(32)}}`;

test("parseArgs keeps the current smoke options and rejects invalid participant ids", () => {
  const options = parseArgs([
    "--base-url",
    "http://localhost:8080/",
    "--student-a-id",
    "9400001",
    "--student-a-password",
    "fixture-a-password",
    "--student-b-id",
    "9500001",
    "--student-b-password",
    "fixture-b-password",
    "--compose-file",
    "fixture-compose.yml",
    "--env-file",
    "fixture.env",
    "--runtime-secrets-dir",
    "fixture-secrets",
  ]);

  assert.equal(options.baseUrl, "http://localhost:8080");
  assert.equal(options.studentAId, "9400001");
  assert.equal(options.studentBId, "9500001");
  assert.equal(options.composeFile, "fixture-compose.yml");
  assert.equal(options.envFile, "fixture.env");
  assert.equal(options.runtimeSecretsDir, "fixture-secrets");
  assert.throws(() => parseArgs(["--student-a-id", "not-seven-digits"]));
  assert.throws(() => parseArgs(["--student-a-id", "9400001", "--student-b-id", "9400001"]));
});

test("challenge 07 helpers target the current board search and escape checks", () => {
  assert.equal(sqliSecretPostPath(), sqliSearchPath());
  assert.match(decodeURIComponent(sqliSearchPath()), /\/challenges\/07\/search\?q=.*UNION SELECT id, flag, source FROM flags/);
  assert.match(decodeURIComponent(readfileSearchPath()), /readfile\('\/etc\/passwd'\)/);
  assert.match(decodeURIComponent(sqliteShellSearchPath()), /\.shell echo runtime-challenge-smoke/);
});

test("extractFlag accepts one fixture flag and rejects missing or duplicate values", () => {
  assert.equal(extractFlag(`prefix ${FIXTURE_FLAG} suffix`), FIXTURE_FLAG);
  assert.throws(() => extractFlag("no current value"));
  assert.throws(() => extractFlag(`${FIXTURE_FLAG} ${FIXTURE_FLAG}`));
});

test("challenge 04 bundle helper keeps the localStorage path isolated", () => {
  const script = `
    (() => {
      const panel = document.getElementById("admin-panel");
      const box = document.getElementById("flag-box");
      if (localStorage.getItem("isAdmin") === "true") {
        panel.removeAttribute("hidden");
        box.textContent = "fixture-value";
      }
    })();
  `;

  assert.deepEqual(runAdminBundle(script, false), { panelVisible: false, textContent: "" });
  assert.deepEqual(runAdminBundle(script, true), { panelVisible: true, textContent: "fixture-value" });
});

test("challenge 08 forge helper performs SHA-256 prefix-MAC length extension", () => {
  const key = Buffer.alloc(32, 0x42);
  const payload = Buffer.from("visit=1700000000&holder=guest&role=guest");
  const originalDigest = createHash("sha256").update(Buffer.concat([key, payload])).digest("hex");
  const originalTicket = `${payload.toString("base64url")}.${originalDigest}`;
  const forgedTicket = forgeVaultTicket(originalTicket);
  const separator = forgedTicket.lastIndexOf(".");
  const forgedPayload = Buffer.from(forgedTicket.slice(0, separator), "base64url");
  const forgedDigest = forgedTicket.slice(separator + 1);
  const expectedDigest = createHash("sha256").update(Buffer.concat([key, forgedPayload])).digest("hex");

  assert.equal(forgedDigest, expectedDigest);
  assert(forgedPayload.includes(Buffer.from("&role=winner")));
  assert.equal((32 + payload.byteLength + sha256Padding(32 + payload.byteLength).byteLength) % 64, 0);
});

test("cookie helpers retain only cookie pairs and merge Set-Cookie updates", () => {
  const headers = {
    getSetCookie() {
      return [
        "ctf_session=session-fixture; HttpOnly; Path=/",
        "vault_ticket=ticket-fixture; Path=/challenges/08",
      ];
    },
  };
  const merged = mergeCookies("", headers);
  assert.equal(getCookieValue(merged, "ctf_session"), "session-fixture");
  assert.equal(getCookieValue(merged, "vault_ticket"), "ticket-fixture");
  const replaced = setCookieValue(merged, "vault_ticket", "replacement-fixture");
  assert.equal(getCookieValue(replaced, "vault_ticket"), "replacement-fixture");
  assert.equal(getCookieValue(replaced, "Path"), undefined);
});

test("CLI failure output is boolean-only and does not echo an invalid input", () => {
  const result = spawnSync(process.execPath, ["scripts/runtime-challenge-smoke.mjs", "--student-a-id", "not-seven-digits"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^\[runtime-challenge-smoke\] completed: false\n$/);
  assert(!result.stderr.includes("not-seven-digits"));
});
