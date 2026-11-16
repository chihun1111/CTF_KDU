import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hmacLookupHash } from "../packages/config/dist/index.js";
import {
  assertNoSensitiveMaterial,
  buildAdminRoleUpdateQuery,
  buildStrictFixtureQuery,
  buildUserIdQuery,
  parseArgs,
  readFirstPsqlValue,
  runtimeStudentHash,
} from "./runtime-admin-smoke.mjs";

test("admin smoke looks up users with the same HMAC key derivation as the backend", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ctf-admin-smoke-"));
  try {
    const pepper = "test-only-pepper-with-at-least-32-characters";
    writeFileSync(path.join(directory, "student_id_hash_pepper"), `${pepper}\n`, { mode: 0o600 });
    assert.equal(runtimeStudentHash({ runtimeSecretsDir: directory }, "9201234"), hmacLookupHash(pepper, "9201234"));
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("runtime-admin-smoke accepts documented pnpm delimiter and admin options", () => {
  const options = parseArgs([
    "--",
    "--base-url",
    "http://127.0.0.1/",
    "--admin-student-id",
    "9201234",
    "--admin-password",
    "AdminSmokePassword8",
    "--participant-student-id",
    "9211234",
    "--participant-password",
    "ParticipantSmokePassword8",
    "--runtime-secrets-dir",
    "/tmp/runtime-secrets",
  ]);

  assert.equal(options.baseUrl, "http://127.0.0.1");
  assert.equal(options.adminStudentId, "9201234");
  assert.equal(options.adminPassword, "AdminSmokePassword8");
  assert.equal(options.participantStudentId, "9211234");
  assert.equal(options.participantPassword, "ParticipantSmokePassword8");
  assert.equal(options.runtimeSecretsDir, "/tmp/runtime-secrets");
  assert.equal(options.strictFixtures, false);
});

test("strict admin fixtures are opt-in and require an isolated CI project with a loopback origin", () => {
  const isolated = { CI: "true", COMPOSE_PROJECT_NAME: "ctf-ci-123456" };
  for (const baseUrl of ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"]) {
    assert.equal(parseArgs(["--strict-fixtures", "--base-url", baseUrl], isolated).strictFixtures, true);
  }
  assert.equal(parseArgs([], {}).strictFixtures, false);
  for (const env of [{}, { CI: "false", COMPOSE_PROJECT_NAME: "ctf-ci-123" }, { CI: "true" },
    { CI: "true", COMPOSE_PROJECT_NAME: "ctf-production" }, { CI: "true", COMPOSE_PROJECT_NAME: "ctf-ci-staging" }]) {
    assert.throws(() => parseArgs(["--strict-fixtures"], env), /isolated ctf-ci/);
  }
  for (const baseUrl of ["https://example.invalid", "http://localhost.evil", "http://localhost@elsewhere.invalid", "ftp://localhost",
    "http://localhost/production", "http://localhost?target=production", "http://localhost#production", "http://user:pass@localhost"]) {
    assert.throws(() => parseArgs(["--strict-fixtures", "--base-url", baseUrl], isolated), /loopback HTTP/);
  }
});

test("unsafe strict fixture CLI exits before HTTP or Docker mutations", () => {
  const guard = `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    globalThis.fetch = () => { throw new Error('HTTP_MUTATION_ATTEMPTED'); };
    childProcess.spawnSync = () => { throw new Error('DOCKER_MUTATION_ATTEMPTED'); };
    syncBuiltinESMExports();
  `;
  assert.throws(() => execFileSync(process.execPath, [
    "--import", `data:text/javascript;base64,${Buffer.from(guard).toString("base64")}`,
    "scripts/runtime-admin-smoke.mjs", "--strict-fixtures",
  ], {
    encoding: "utf8", timeout: 5_000, env: { ...process.env, CI: "false", COMPOSE_PROJECT_NAME: "ctf-production" },
    stdio: ["ignore", "pipe", "pipe"],
  }), (error) => {
    assert.match(error.stderr, /Strict admin fixtures require CI=true/);
    assert.doesNotMatch(error.stderr, /MUTATION_ATTEMPTED/);
    return true;
  });
});

test("strict fixture SQL accepts only constrained unique UUIDs and one fresh participant", () => {
  const participant = "00000000-0000-4000-8000-000000000001";
  const fixtures = {
    auditIds: [2, 3, 4, 5].map((suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`),
    submissionIds: [7, 6].map((suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`),
  };
  const query = buildStrictFixtureQuery(participant, fixtures);
  assert.match(query, /role = 'participant'/);
  assert.match(query, /NOT EXISTS \(SELECT 1 FROM final_submissions/);
  assert.match(query, /NULL::jsonb/);
  assert.match(query, /'__proto__'/);
  assert.match(query, /statement_timestamp\(\)/);
  assert.match(query, /000000000006', 1\), \('00000000-0000-4000-8000-000000000007', 2/);
  assert.throws(() => buildStrictFixtureQuery("'; DROP TABLE users; --", fixtures), /identifiers are invalid/);
  assert.throws(() => buildStrictFixtureQuery(participant, { ...fixtures, auditIds: ["bad", ...fixtures.auditIds.slice(1)] }), /identifiers are invalid/);
  assert.throws(() => buildStrictFixtureQuery(participant, { ...fixtures, submissionIds: [fixtures.auditIds[0], fixtures.auditIds[0]] }), /identifiers are invalid/);
});

test("runtime-admin-smoke rejects invalid or overlapping student ids", () => {
  assert.throws(() => parseArgs(["--admin-student-id", "not-valid"]), /admin-student-id/);
  assert.throws(() => parseArgs(["--admin-student-id", "9201234\n"]), /admin-student-id/);
  assert.throws(
    () => parseArgs(["--admin-student-id", "9201234", "--participant-student-id", "9201234"]),
    /must be different/,
  );
});

test("admin smoke generates and validates only ASCII alphanumeric passwords", () => {
  const generated = parseArgs([]);
  assert.match(generated.adminPassword, /^[A-Za-z0-9]{8,128}(?![\s\S])/);
  assert.match(generated.participantPassword, /^[A-Za-z0-9]{8,128}(?![\s\S])/);
  for (const option of ["--admin-password", "--participant-password"]) {
    for (const password of ["short", "a".repeat(129), "Password8!", "Password8\0", "Password8\n", "Password8\r\n", " Password8", "Password8 ", "😀".repeat(8)]) {
      assert.throws(() => parseArgs([option, password]), /password must be 8 to 128 ASCII/);
    }
    for (const password of ["abcdefgh", "12345678", "A".repeat(128)]) {
      assert.doesNotThrow(() => parseArgs([option, password]));
    }
  }
});

test("runtime-admin-smoke builds constrained user lookup and admin update queries", () => {
  const hash = "a".repeat(64);

  assert.match(buildUserIdQuery(hash), /select id from users/);
  assert.match(buildUserIdQuery(hash), /student_id_hash = 'a{64}'/);
  assert.match(buildAdminRoleUpdateQuery(hash), /update users set role = 'admin'/);
  assert.match(buildAdminRoleUpdateQuery(hash), /student_id_hash = 'a{64}'/);
  assert.throws(() => buildUserIdQuery("not-a-hash"), /student id hash/);
  assert.throws(() => buildAdminRoleUpdateQuery("not-a-hash"), /student id hash/);
});

test("runtime-admin-smoke reads the first psql value before command tags", () => {
  assert.equal(readFirstPsqlValue("019e0d46-4111-7f21-8d22-fa940da64207\nUPDATE 1\n"), "019e0d46-4111-7f21-8d22-fa940da64207");
  assert.equal(readFirstPsqlValue("\n 019e0d46-4111-7f21-8d22-fa940da64207 \n"), "019e0d46-4111-7f21-8d22-fa940da64207");
  assert.throws(() => readFirstPsqlValue("UPDATE 0\n"), /No row value/);
});

test("runtime-admin-smoke allows pseudonymous references but rejects student ids and other sensitive material", () => {
  const options = {
    adminStudentId: "9201234",
    adminPassword: "AdminSmokePassword8",
    participantStudentId: "9211234",
    participantPassword: "ParticipantSmokePassword8",
  };
  assert.doesNotThrow(
    () => assertNoSensitiveMaterial('{"onlineSessionCount":1,"participantRef":"participant:abc","actorRef":null}', options),
  );
  assert.throws(() => assertNoSensitiveMaterial('{"studentId":"9211234"}', options), /participant student id/);
  assert.throws(
    () => assertNoSensitiveMaterial("KDUCTF{fixture}", options),
    /flag material/,
  );
  assert.throws(() => assertNoSensitiveMaterial('{"clearReceiptCode":"opaque"}', options), /clear receipt code/);
  assert.throws(
    () => assertNoSensitiveMaterial('{"artifactQueue":{"status":"ok"}}', options),
    /legacy artifact queue/,
  );
  assert.throws(
    () => assertNoSensitiveMaterial('{"claimVerifyFailureCountLast10m":0}', options),
    /legacy claim failure count/,
  );
});

test("runtime-admin-smoke CLI invokes main for direct script execution", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/runtime-admin-smoke.mjs", "--admin-student-id", "not-valid"], { encoding: "utf8" }),
    (error) => {
      assert.match(error.stderr, /admin-student-id must be exactly 7 digits/);
      return true;
    },
  );
});
