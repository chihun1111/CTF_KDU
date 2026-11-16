import { decryptField, hmacLookupHash } from "../packages/config/dist/index.js";
export { decryptField } from "../packages/config/dist/index.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FINAL_FLAG_IDS = ["FLAG-01", "FLAG-02", "FLAG-03", "FLAG-04", "FLAG-05", "FLAG-06", "FLAG-07", "FLAG-08"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseArgs(argv) {
  const options = {
    baseUrl: "http://localhost",
    studentId: null,
    password: `ClearSmoke-${Date.now()}-password`,
    composeFile: "infra/docker/docker-compose.yml",
    envFile: ".env.production",
    runtimeSecretsDir: process.env.RUNTIME_SECRETS_DIR ?? "secrets/runtime-only",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--student-id") {
      options.studentId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--password") {
      options.password = argv[index + 1];
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
  options.studentId ??= String(9100000 + Math.floor(Math.random() * 899999)).slice(0, 7);
  assert(/^\d{7}$/.test(options.studentId), "--student-id must be exactly 7 digits");
  return options;
}

function readSecret(dir, name) {
  return readFileSync(`${dir}/${name}`, "utf8").trim();
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
    return JSON.parse(text);
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

export function buildFlagQuery(studentIdHash) {
  assert(/^[a-f0-9]{64}$/.test(studentIdHash), "student id hash must be hex sha256");
  return [
    "select coalesce(jsonb_object_agg(c.flag_id, cf.flag_ciphertext order by c.flag_id), '{}'::jsonb)::text",
    "from users u",
    "join challenge_flags cf on cf.user_id = u.id",
    "join challenges c on c.id = cf.challenge_id",
    `where u.student_id_hash = '${studentIdHash}'`,
  ].join(" ");
}

export function buildFinalSubmitAuditQuery(studentIdHash) {
  assert(/^[a-f0-9]{64}$/.test(studentIdHash), "student id hash must be hex sha256");
  return [
    "select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'metadata', a.metadata) order by a.created_at desc), '[]'::jsonb)::text",
    "from users u",
    "join audit_logs a on a.user_id = u.id",
    `where u.student_id_hash = '${studentIdHash}' and a.action = 'FINAL_SUBMIT'`,
  ].join(" ");
}

function runPostgresTextQuery(options, query) {
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
      'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"',
      "psql-query",
      query,
    ],
    { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
  );

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`Failed to run runtime database query with exit code ${result.status ?? "unknown"}`);
  }

  return result.stdout.trim();
}

function readIssuedFlagsFromDb(options) {
  const studentPepper = readSecret(options.runtimeSecretsDir, "student_id_hash_pepper");
  const flagKey = readSecret(options.runtimeSecretsDir, "flag_encryption_key");

  const encryptedByFlagId = JSON.parse(runPostgresTextQuery(options, buildFlagQuery(hmacLookupHash(studentPepper, options.studentId))) || "{}");
  assert(Object.keys(encryptedByFlagId).length === FINAL_FLAG_IDS.length, "runtime database did not return 8 issued flags");
  return Object.fromEntries(
    FINAL_FLAG_IDS.map((flagId) => {
      const bundle = encryptedByFlagId[flagId];
      assert(bundle, `runtime database did not return ${flagId}`);
      return [flagId, decryptField(bundle, flagKey)];
    }),
  );
}

function readFinalSubmitAuditsFromDb(options) {
  const studentPepper = readSecret(options.runtimeSecretsDir, "student_id_hash_pepper");
  return JSON.parse(runPostgresTextQuery(options, buildFinalSubmitAuditQuery(hmacLookupHash(studentPepper, options.studentId))) || "[]");
}

function permuteFlagsAcrossSlots(flagsByFlagId) {
  return Object.fromEntries(
    FINAL_FLAG_IDS.map((slotFlagId, index) => [slotFlagId, flagsByFlagId[FINAL_FLAG_IDS[FINAL_FLAG_IDS.length - index - 1]]]),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let cookie = "";

  async function step(name, callback) {
    await callback();
    console.log(`[runtime-clear-smoke] ${name}`);
  }

  await step("registers a participant for clear-flow validation", async () => {
    const response = await request(options, "/api/auth/register", {
      method: "POST",
      json: {
        studentId: options.studentId,
        password: options.password,
        consent: {
          consentVersion: "runtime-clear-smoke",
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
    cookie = mergeCookies(cookie, response);
  });

  let flagsByFlagId;
  await step("derives issued flags without printing flag values", async () => {
    flagsByFlagId = readIssuedFlagsFromDb(options);
  });

  await step("valid final submit issues one-time clear cookie", async () => {
    const response = await request(options, "/api/final-submit", {
      method: "POST",
      cookie,
      json: { flagsByFlagId: permuteFlagsAcrossSlots(flagsByFlagId) },
    });
    assert([200, 201].includes(response.status), `/api/final-submit returned ${response.status}`);
    const setCookie = getSetCookies(response.headers).join("\n");
    assert(/ctf_clear_once=/.test(setCookie), "valid submit did not set ctf_clear_once");
    assert(/HttpOnly/i.test(setCookie), "ctf_clear_once is not HttpOnly");
    const body = await readJson(response);
    assert(body.cleared === true, "valid submit did not clear");
    assert(JSON.stringify(body).includes("KDUCTF{") === false, "valid submit body includes flag material");
    cookie = mergeCookies(cookie, response);
  });

  await step("participant final submit audit is available by user", async () => {
    const audits = readFinalSubmitAuditsFromDb(options);
    assert(audits.length >= 1, "runtime database did not return a participant FINAL_SUBMIT audit");
    const latest = audits[0];
    assert(latest.action === "FINAL_SUBMIT", "latest participant audit is not FINAL_SUBMIT");
    assert(latest.metadata?.correctCount === 8, "FINAL_SUBMIT audit correctCount is not 8");
    assert(latest.metadata?.requiredCount === 8, "FINAL_SUBMIT audit requiredCount is not 8");
    assert(latest.metadata?.submittedCount === 8, "FINAL_SUBMIT audit submittedCount is not 8");
    assert(latest.metadata?.cleared === true, "FINAL_SUBMIT audit did not record cleared=true");
    assert(JSON.stringify(audits).includes("KDUCTF{") === false, "FINAL_SUBMIT audit includes flag material");
    assert(JSON.stringify(audits).includes(options.studentId) === false, "FINAL_SUBMIT audit includes plaintext student id");
  });

  await step("clear page consumes the one-time cookie once", async () => {
    const first = await request(options, "/clear", { cookie });
    assert(first.status === 200, `/clear first render returned ${first.status}`);
    const firstBody = await first.text();
    assert(firstBody.includes(options.studentId), "/clear did not render the clear certificate student id");
    cookie = mergeCookies(cookie, first);
    const second = await request(options, "/clear", { cookie });
    assert([302, 303, 307, 308].includes(second.status), `/clear second render returned ${second.status}`);
    assert((second.headers.get("location") ?? "").includes("/submit"), "clear page did not redirect to submit after consume");
  });

  console.log(`[runtime-clear-smoke] completed clear-flow checks against ${options.baseUrl}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[runtime-clear-smoke] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
