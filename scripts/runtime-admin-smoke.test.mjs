import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  assertNoSensitiveMaterial,
  buildAdminRoleUpdateQuery,
  buildUserIdQuery,
  parseArgs,
  readFirstPsqlValue,
} from "./runtime-admin-smoke.mjs";

test("runtime-admin-smoke accepts documented pnpm delimiter and admin options", () => {
  const options = parseArgs([
    "--",
    "--base-url",
    "http://127.0.0.1/",
    "--admin-student-id",
    "9201234",
    "--admin-password",
    "AdminSmoke-password",
    "--participant-student-id",
    "9211234",
    "--participant-password",
    "ParticipantSmoke-password",
    "--runtime-secrets-dir",
    "/tmp/runtime-secrets",
  ]);

  assert.equal(options.baseUrl, "http://127.0.0.1");
  assert.equal(options.adminStudentId, "9201234");
  assert.equal(options.adminPassword, "AdminSmoke-password");
  assert.equal(options.participantStudentId, "9211234");
  assert.equal(options.participantPassword, "ParticipantSmoke-password");
  assert.equal(options.runtimeSecretsDir, "/tmp/runtime-secrets");
});

test("runtime-admin-smoke rejects invalid or overlapping student ids", () => {
  assert.throws(() => parseArgs(["--admin-student-id", "not-valid"]), /admin-student-id/);
  assert.throws(
    () => parseArgs(["--admin-student-id", "9201234", "--participant-student-id", "9201234"]),
    /must be different/,
  );
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
    adminPassword: "AdminSmoke-password",
    participantStudentId: "9211234",
    participantPassword: "ParticipantSmoke-password",
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
