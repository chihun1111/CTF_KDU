import { hmacLookupHash } from "../packages/config/dist/index.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomStudentId(base) {
  return String(base + Math.floor(Math.random() * 79_999)).slice(0, 7);
}

export function parseArgs(argv, env = process.env) {
  const options = {
    baseUrl: "http://localhost",
    adminStudentId: null,
    adminPassword: `AdminSmoke${Date.now()}Password`,
    participantStudentId: null,
    participantPassword: `ParticipantSmoke${Date.now()}Password`,
    composeFile: "infra/docker/docker-compose.yml",
    envFile: ".env.production",
    runtimeSecretsDir: env.RUNTIME_SECRETS_DIR ?? "secrets/runtime-only",
    strictFixtures: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--strict-fixtures") {
      options.strictFixtures = true;
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--admin-student-id") {
      options.adminStudentId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--admin-password") {
      options.adminPassword = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--participant-student-id") {
      options.participantStudentId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--participant-password") {
      options.participantPassword = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--runtime-secrets-dir") {
      options.runtimeSecretsDir = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  options.adminStudentId ??= randomStudentId(9200000);
  options.participantStudentId ??= randomStudentId(9300000);
  assert(/^\d{7}(?![\s\S])/.test(options.adminStudentId), "--admin-student-id must be exactly 7 digits");
  assert(/^\d{7}(?![\s\S])/.test(options.participantStudentId), "--participant-student-id must be exactly 7 digits");
  assert(options.adminStudentId !== options.participantStudentId, "admin and participant student ids must be different");
  for (const [name, password] of [["admin", options.adminPassword], ["participant", options.participantPassword]]) {
    assert(typeof password === "string" && /^[A-Za-z0-9]{8,128}(?![\s\S])/.test(password),
      `--${name}-password must be 8 to 128 ASCII letters or digits`);
  }
  if (options.strictFixtures) {
    assert(env.CI === "true" && /^ctf-ci-\d+$/.test(env.COMPOSE_PROJECT_NAME ?? ""),
      "Strict admin fixtures require CI=true and an isolated ctf-ci-<digits> Compose project");
    const url = new URL(options.baseUrl);
    assert(["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
    "Strict admin fixtures require a loopback HTTP(S) origin");
  }
  return options;
}

function readSecret(dir, name) {
  return readFileSync(`${dir}/${name}`, "utf8").trim();
}

function assertStudentHash(studentIdHash) {
  assert(/^[a-f0-9]{64}$/.test(studentIdHash), "student id hash must be hex sha256");
}

export function buildUserIdQuery(studentIdHash) {
  assertStudentHash(studentIdHash);
  return `select id from users where student_id_hash = '${studentIdHash}' limit 1`;
}

export function buildAdminRoleUpdateQuery(studentIdHash) {
  assertStudentHash(studentIdHash);
  return `update users set role = 'admin' where student_id_hash = '${studentIdHash}' returning id`;
}

export function buildStrictFixtureQuery(participantUserId, fixtures) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert(uuid.test(participantUserId) && fixtures.auditIds?.length === 4 && fixtures.submissionIds?.length === 2,
    "Strict admin fixture identifiers are invalid");
  const allIds = [...fixtures.auditIds, ...fixtures.submissionIds];
  assert(allIds.every((id) => typeof id === "string" && uuid.test(id)) && new Set(allIds).size === allIds.length,
    "Strict admin fixture identifiers are invalid");
  const [firstSubmissionId, latestSubmissionId] = [...fixtures.submissionIds].sort();
  // One data-modifying CTE statement is atomic. Never seed into a participant
  // who already submitted, even if this helper is invoked with the wrong ID.
  return `
WITH eligible AS (
  SELECT id FROM users WHERE id = '${participantUserId}' AND role = 'participant'
    AND NOT EXISTS (SELECT 1 FROM final_submissions WHERE user_id = '${participantUserId}')
), inserted_audits AS (
  INSERT INTO audit_logs (id, user_id, action, metadata)
  SELECT fixture.id::uuid, eligible.id, fixture.action, fixture.metadata
  FROM eligible CROSS JOIN (VALUES
    ('${fixtures.auditIds[0]}', 'ADMIN_AUDIT_LOGS_VIEWED', NULL::jsonb),
    ('${fixtures.auditIds[1]}', 'ADMIN_AUDIT_LOGS_VIEWED', '"legacy"'::jsonb),
    ('${fixtures.auditIds[2]}', '__proto__', '{"page":1,"reason":"strict-fixture-hidden"}'::jsonb),
    ('${fixtures.auditIds[3]}', 'STRICT_UNKNOWN_ACTION', '{"reason":"strict-fixture-hidden"}'::jsonb)
  ) AS fixture(id, action, metadata)
  RETURNING id
), inserted_submissions AS (
  INSERT INTO final_submissions (id, user_id, submitted_hash_bundle, correct_count, is_clear, created_at)
  SELECT fixture.id::uuid, eligible.id, '{}'::jsonb, fixture.correct_count, false, statement_timestamp()
  FROM eligible CROSS JOIN (VALUES ('${firstSubmissionId}', 1), ('${latestSubmissionId}', 2)) AS fixture(id, correct_count)
  RETURNING id, user_id
), inserted_results AS (
  INSERT INTO final_submission_results (final_submission_id, user_id, flag_id, challenge_id, submitted_flag_hash, is_correct)
  SELECT submission.id, submission.user_id, fixture.flag_id, challenge.id, 'strict-fixture-hash', true
  FROM inserted_submissions AS submission
  JOIN (VALUES ('${firstSubmissionId}', 'FLAG-01'), ('${latestSubmissionId}', 'FLAG-01'), ('${latestSubmissionId}', 'FLAG-02')) AS fixture(id, flag_id)
    ON submission.id = fixture.id::uuid
  JOIN challenges AS challenge ON challenge.flag_id = fixture.flag_id
  RETURNING id
)
SELECT jsonb_build_object('auditCount', (SELECT count(*) FROM inserted_audits),
  'submissionCount', (SELECT count(*) FROM inserted_submissions), 'resultCount', (SELECT count(*) FROM inserted_results))::text;
`;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function mergeCookies(cookieHeader, response) {
  const cookies = new Map();
  for (const part of cookieHeader.split(/;\s*/).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    cookies.set(name, rest.join("="));
  }
  for (const setCookie of getSetCookies(response.headers)) {
    const [pair] = setCookie.split(";");
    const [name, ...rest] = pair.split("=");
    if (name && rest.length > 0) {
      cookies.set(name, rest.join("="));
    }
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { body: JSON.parse(text), text };
  } catch {
    throw new Error(`Expected JSON from ${new URL(response.url).pathname}`);
  }
}

async function request(options, path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (init.cookie) {
    headers.set("cookie", init.cookie);
  }
  return fetch(`${options.baseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers,
    redirect: init.redirect ?? "manual",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

export function assertNoSensitiveMaterial(text, options) {
  const forbidden = [
    { label: "admin password", value: options.adminPassword },
    { label: "participant password", value: options.participantPassword },
    { label: "admin student id", value: options.adminStudentId },
    { label: "participant student id", value: options.participantStudentId },
    { label: "flag material", value: "KDUCTF{" },
    { label: "session cookie material", value: "ctf_session" },
    { label: "clear cookie material", value: "ctf_clear_once" },
    { label: "student id field", value: '"studentId"' },
    { label: "user id field", value: '"userId"' },
    { label: "admin user id field", value: '"adminUserId"' },
    { label: "target user id field", value: '"targetUserId"' },
    { label: "database user id field", value: '"user_id"' },
    { label: "masked student id field", value: '"maskedStudentId"' },
    { label: "released admin id field", value: "releasedByAdminUserId" },
    { label: "clear receipt code", value: '"clearReceiptCode"' },
    { label: "legacy artifact count", value: '"artifactGeneratedCount"' },
    { label: "legacy artifact failure count", value: '"artifactFailureCountLast10m"' },
    { label: "legacy claim failure count", value: '"claimVerifyFailureCountLast10m"' },
    { label: "legacy artifact queue", value: '"artifactQueue"' },
  ].filter((entry) => entry.value);
  for (const entry of forbidden) {
    assert(!text.includes(entry.value), `admin response included forbidden ${entry.label}`);
  }
}

function runPsqlQuery(options, query) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      options.composeFile,
      "--env-file",
      options.envFile,
      "exec",
      "-T",
      "postgres",
      "sh",
      "-c",
      'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"',
      "psql-query",
      query,
    ],
    { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to query runtime database with exit code ${result.status ?? "unknown"}`);
  }

  return readFirstPsqlValue(result.stdout);
}

export function readFirstPsqlValue(stdout) {
  const value = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^[A-Z]+ \d+$/.test(line));
  assert(value, "No row value returned from runtime database");
  return value;
}

export function runtimeStudentHash(options, studentId) {
  return hmacLookupHash(readSecret(options.runtimeSecretsDir, "student_id_hash_pepper"), studentId);
}

async function registerParticipant(options, studentId, password) {
  const response = await request(options, "/api/auth/register", {
    method: "POST",
    json: {
      studentId,
      password,
      consent: {
        consentVersion: "runtime-admin-smoke",
        requiredLoggingAccepted: true,
        analyticsLoggingAccepted: false,
        cookieAccepted: true,
      },
    },
  });
  assert([200, 201].includes(response.status), `/api/auth/register returned ${response.status}`);
  const setCookie = getSetCookies(response.headers).join("\n");
  assert(/ctf_session=/.test(setCookie), "registration did not set ctf_session");
  assert(/HttpOnly/i.test(setCookie), "ctf_session is not HttpOnly");
  const bodyText = await response.text();
  assert(!bodyText.includes("ctf_session"), "registration body includes session material");
  return mergeCookies("", response);
}

async function expectAdminJson(options, cookie, path, validate) {
  const response = await request(options, path, { cookie });
  assert(response.status === 200, `${path} returned ${response.status}`);
  const { body, text } = await readJson(response);
  assertNoSensitiveMaterial(text, options);
  assert(!text.includes('"studentId"'), `${path} exposed studentId`);
  assert(!text.includes('"userId"'), `${path} exposed userId`);
  assert(!text.includes("releasedByAdminUserId"), `${path} exposed an admin user id`);
  validate(body);
  return body;
}

const ADMIN_ENDPOINTS = [
  {
    path: "/api/admin/operations/summary",
    validate: (body) => {
      assert(Number.isInteger(body.registeredUserCount), "summary missing registeredUserCount");
      assert(Number.isInteger(body.onlineSessionCount), "summary missing onlineSessionCount");
      assert(body.systemHealth?.backend === "ok", "summary backend health is not ok");
    },
  },
  {
    path: "/api/admin/operations/online-count",
    validate: (body) => {
      assert(Number.isInteger(body.onlineSessionCount), "online-count missing onlineSessionCount");
      assert(["redis_presence", "db_last_seen_fallback"].includes(body.source), "online-count source is invalid");
      assert(typeof body.generatedAt === "string", "online-count missing generatedAt");
    },
  },
  {
    path: "/api/admin/participants",
    validate: (body) => {
      assert(Array.isArray(body.items), "participants items is not an array");
      assert(Number.isInteger(body.totalCount), "participants missing totalCount");
      assert(body.items.every((item) => /^participant:[0-9a-f]{12}$/.test(item.participantRef)), "participants contain an invalid participantRef");
    },
  },
  {
    path: "/api/admin/submissions",
    validate: (body) => {
      assert(Array.isArray(body.items), "submissions items is not an array");
      assert(Number.isInteger(body.totalCount), "submissions missing totalCount");
      assert(body.items.every((item) => /^participant:[0-9a-f]{12}$/.test(item.participantRef)), "submissions contain an invalid participantRef");
    },
  },
  {
    path: "/api/admin/clears",
    validate: (body) => {
      assert(Array.isArray(body.items), "clears items is not an array");
      assert(Number.isInteger(body.totalCount), "clears missing totalCount");
      assert(body.items.every((item) => /^participant:[0-9a-f]{12}$/.test(item.participantRef)), "clears contain an invalid participantRef");
    },
  },
  {
    path: "/api/admin/challenges/status",
    validate: (body) => {
      assert(Array.isArray(body), "challenge status is not an array");
      assert(body.length === 8, `expected 8 challenge status rows, got ${body.length}`);
      const expectedPaths = [
        "/challenges/01/",
        "/challenges/02/",
        "/challenges/03/",
        "/challenges/04/",
        "/challenges/05/",
        "/challenges/06/",
        "/challenges/07/",
        "/challenges/08/",
      ];
      assert(
        body.every(
          (item, index) => item.challengeId === String(index + 1).padStart(2, "0") && item.servicePath === expectedPaths[index],
        ),
        "challenge status does not match the eight active service paths",
      );
    },
  },
  {
    path: "/api/admin/system/health",
    validate: (body) => {
      assert(body.backend?.status === "ok", "system health backend is not ok");
      assert(body.postgres?.status === "ok", "system health postgres is not ok");
      assert(Array.isArray(body.challengeServices), "system health missing challenge services");
      assert(body.challengeServices.length === 8, "system health does not contain eight challenge services");
      assert(
        body.challengeServices.every((item, index) => item.challengeId === String(index + 1).padStart(2, "0")),
        "system health challenge services are not the active eight",
      );
    },
  },
  {
    path: "/api/admin/audit-logs",
    validate: (body) => {
      assert(Array.isArray(body.items), "audit log items is not an array");
      assert(Number.isInteger(body.totalCount), "audit logs missing totalCount");
      assert(body.items.every((item) => item.actorRef === null || /^participant:[0-9a-f]{12}$/.test(item.actorRef)), "audit logs contain an invalid actorRef");
    },
  },
  {
    path: "/api/admin/hints",
    validate: (body) => {
      assert(Number.isInteger(body.totalStageCount), "admin hints missing totalStageCount");
      assert(body.totalStageCount === 24, `expected 24 hint stages, got ${body.totalStageCount}`);
      assert(Array.isArray(body.challenges), "admin hints challenges is not an array");
    },
  },
];

async function verifyStrictFixtures(options, participantUserId, participantCookie, adminCookie) {
  const fixtures = {
    auditIds: Array.from({ length: 4 }, () => randomUUID()),
    submissionIds: Array.from({ length: 2 }, () => randomUUID()).sort(),
  };
  const inserted = JSON.parse(runPsqlQuery(options, buildStrictFixtureQuery(participantUserId, fixtures)));
  assert(inserted.auditCount === 4 && inserted.submissionCount === 2 && inserted.resultCount === 3,
    "Strict admin fixtures require a fresh participant and seeded challenges");

  await expectAdminJson(options, adminCookie, "/api/admin/audit-logs", (body) => {
    const rows = body.items?.filter((row) => fixtures.auditIds.includes(row.id));
    assert(rows?.length === 4, "Strict audit fixtures were not visible in the latest audit page");
    assert(rows.every((row) => JSON.stringify(row.metadata) === "{}"), "Strict audit fixtures exposed unapproved metadata");
  });

  const response = await request(options, "/api/progress", { cookie: participantCookie });
  assert(response.status === 200, "Participant progress failed for tied submissions");
  const progress = await readJson(response);
  assertNoSensitiveMaterial(progress.text, options);
  assert(progress.body.correctCount === 2 && progress.body.requiredCount === 8 && progress.body.cleared === false,
    "Participant progress selected the wrong tied submission");
  assert(JSON.stringify(Object.keys(progress.body.resultsByFlagId ?? {}).sort()) === JSON.stringify(["FLAG-01", "FLAG-02"]) &&
    progress.body.resultsByFlagId["FLAG-01"]?.correct === true && progress.body.resultsByFlagId["FLAG-02"]?.correct === true,
  "Participant progress returned results from a different submission");
  const participantRef = `participant:${createHash("sha256").update(participantUserId).digest("hex").slice(0, 12)}`;
  await expectAdminJson(options, adminCookie, "/api/admin/participants", (body) => {
    const participant = body.items?.find((row) => row.participantRef === participantRef);
    assert(participant?.latestCorrectCount === progress.body.correctCount && participant.finalSubmissionCount === 2,
      "Admin and participant views disagree about the latest tied submission");
  });
  const otherResponse = await request(options, "/api/progress", { cookie: adminCookie });
  assert(otherResponse.status === 200, "Separate account progress could not be checked");
  const otherProgress = await readJson(otherResponse);
  assert(otherProgress.body.correctCount === 0 && Object.keys(otherProgress.body.resultsByFlagId ?? {}).length === 0,
    "Strict progress fixture crossed participant boundaries");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  async function step(name, callback) {
    await callback();
    console.log(`[runtime-admin-smoke] ${name}`);
  }

  let participantCookie = "";
  let adminCookie = "";
  let participantUserId = "";

  await step("registers participant and admin candidate sessions", async () => {
    participantCookie = await registerParticipant(options, options.participantStudentId, options.participantPassword);
    adminCookie = await registerParticipant(options, options.adminStudentId, options.adminPassword);
  });

  await step("promotes only the admin candidate in the runtime database", async () => {
    const participantHash = runtimeStudentHash(options, options.participantStudentId);
    const adminHash = runtimeStudentHash(options, options.adminStudentId);
    participantUserId = runPsqlQuery(options, buildUserIdQuery(participantHash));
    const adminUserId = runPsqlQuery(options, buildAdminRoleUpdateQuery(adminHash));
    assert(/^[0-9a-f-]{16,}$/i.test(participantUserId), "participant user id lookup failed");
    assert(/^[0-9a-f-]{16,}$/i.test(adminUserId), "admin role update did not return a user id");
  });

  if (options.strictFixtures) {
    await step("strict PostgreSQL fixtures preserve audit availability and deterministic participant progress", async () => {
      await verifyStrictFixtures(options, participantUserId, participantCookie, adminCookie);
    });
  }

  await step("admin role is resolved from the session cookie", async () => {
    const response = await request(options, "/api/auth/me", { cookie: adminCookie });
    assert(response.status === 200, `/api/auth/me returned ${response.status}`);
    const { body, text } = await readJson(response);
    assertNoSensitiveMaterial(text, options);
    assert(body.authenticated === true, "admin candidate is not authenticated");
    assert(body.role === "admin", `expected admin role, got ${body.role}`);
  });

  await step("participant session is forbidden from admin APIs", async () => {
    for (const endpoint of ADMIN_ENDPOINTS.map((entry) => entry.path)) {
      const response = await request(options, endpoint, { cookie: participantCookie });
      assert(response.status === 403, `${endpoint} returned ${response.status} for participant session`);
    }
  });

  await step("admin session can read operations APIs without forbidden sensitive material", async () => {
    for (const endpoint of ADMIN_ENDPOINTS) {
      await expectAdminJson(options, adminCookie, endpoint.path, endpoint.validate);
    }
    const detailResponse = await request(options, `/api/admin/participants/${participantUserId}`, { cookie: adminCookie });
    assert(detailResponse.status === 404, "removed participant detail endpoint must return 404");
    const artifactResponse = await request(options, "/api/services/it-center-status/artifact", { cookie: adminCookie });
    assert(artifactResponse.status === 404, "removed legacy artifact endpoint must return 404");
  });

  await step("admin operations page renders only pseudonymous participant references", async () => {
    const response = await request(options, "/admin/operations", { cookie: adminCookie });
    assert(response.status === 200, `/admin/operations returned ${response.status}`);
    const text = await response.text();
    assertNoSensitiveMaterial(text, options);
    assert(text.includes("participant:"), "admin page missing pseudonymous participant references");
    assert(!text.includes("participantLogModal"), "admin page still includes participant log drill-down");
    assert(!text.includes("#participant-logs-"), "admin page still includes participant-specific fragment links");
    assert(!text.includes(participantUserId), "admin page exposed a raw participant user id");
  });

  await step("admin session can release a hint stage and participant sees only released hint text", async () => {
    const releaseResponse = await request(options, "/api/admin/hints/release", {
      method: "POST",
      cookie: adminCookie,
      json: { stageId: "01:first" },
    });
    assert([200, 201].includes(releaseResponse.status), `/api/admin/hints/release returned ${releaseResponse.status}`);
    const release = await readJson(releaseResponse);
    assertNoSensitiveMaterial(release.text, options);
    assert(release.body.stageId === "01:first", "hint release returned wrong stage id");

    const publicResponse = await request(options, "/api/hints", { cookie: participantCookie });
    assert(publicResponse.status === 200, `/api/hints returned ${publicResponse.status}`);
    const publicHints = await readJson(publicResponse);
    assertNoSensitiveMaterial(publicHints.text, options);
    const firstChallenge = publicHints.body.challenges?.find((challenge) => challenge.number === "01");
    const firstStage = firstChallenge?.stages?.find((stage) => stage.stageId === "01:first");
    const secondStage = firstChallenge?.stages?.find((stage) => stage.stageId === "01:second");
    assert(firstStage?.released === true && typeof firstStage.text === "string", "released hint text is missing");
    assert(secondStage?.released === false && !("text" in secondStage), "unreleased hint text leaked");
  });

  console.log(`[runtime-admin-smoke] completed admin-flow checks against ${options.baseUrl}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[runtime-admin-smoke] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
