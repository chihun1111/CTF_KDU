import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const verifierPath = path.join(repoRoot, "scripts/verify-workspace.mjs");
const challengeIds = Array.from({ length: 8 }, (_, index) => String(index + 1).padStart(2, "0"));
const servicePaths = [
  "/campus/festival/",
  "/system/status/",
  "/student/assignments/",
  "/clubs/admin/",
  "/clubs/security/",
  "/clubs/build-archive/",
  "/community/board/",
  "/bonus/vault/",
];

function writeFixtureFile(root, filePath, contents = "") {
  const fullPath = path.join(root, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function createBaseWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-verify-"));

  writeFixtureFile(root, "package.json", '{\n  "packageManager": "pnpm@10.32.1",\n  "scripts": {\n    "preflight:deploy": "node scripts/deployment-preflight.mjs",\n    "smoke:admin": "node scripts/runtime-admin-smoke.mjs",\n    "smoke:challenges": "node scripts/runtime-challenge-smoke.mjs",\n    "smoke:clear": "node scripts/runtime-clear-smoke.mjs",\n    "smoke:runtime": "node scripts/runtime-smoke.mjs",\n    "secrets:generate": "node scripts/generate-runtime-secrets.mjs",\n    "verify:compose": "node scripts/verify-compose-static.mjs",\n    "verify:compose-runtime": "node scripts/verify-compose-runtime.mjs",\n    "verify:images": "node scripts/verify-docker-image-pulls.mjs",\n    "verify:workspace": "node scripts/verify-workspace.mjs",\n    "verify:sensitive": "node scripts/verify-sensitive-artifacts.mjs",\n    "verify:secrets": "node scripts/verify-runtime-secrets.mjs"\n  }\n}\n');
  writeFixtureFile(root, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n  - "challenge-services/*"\n');
  writeFixtureFile(root, "tsconfig.base.json", "{}");
  writeFixtureFile(root, ".env.example", "");
  writeFixtureFile(root, ".gitignore", "");
  writeFixtureFile(
    root,
    ".dockerignore",
    [".env", ".env.*", "secrets/runtime-only", "Docs/problems", "Docs/development/flags"].join("\n"),
  );

  writeFixtureFile(root, "apps/frontend/package.json", "{}");
  writeFixtureFile(root, "apps/frontend/Dockerfile", "FROM node\n");
  writeFixtureFile(root, "apps/frontend/app/page.tsx", "");
  writeFixtureFile(root, "apps/frontend/app/health/route.ts", "");

  writeFixtureFile(root, "apps/backend/package.json", JSON.stringify({ scripts: { build: "tsc -p tsconfig.build.json" } }));
  writeFixtureFile(root, "apps/backend/Dockerfile", "FROM node\nCOPY --from=build /app/apps/backend/dist ./apps/backend/dist\n");
  writeFixtureFile(root, "apps/backend/src/main.ts", "");
  writeFixtureFile(root, "apps/backend/src/challenges/challenges.module.ts", "controllers: [ChallengesController, ProgressController]\n");
  writeFixtureFile(root, "apps/backend/src/health.controller.ts", "");
  writeFixtureFile(root, "scripts/verify-sensitive-artifacts.mjs", "");
  writeFixtureFile(root, "scripts/verify-runtime-secrets.mjs", "");
  writeFixtureFile(root, "scripts/generate-runtime-secrets.mjs", "");
  writeFixtureFile(root, "scripts/deployment-preflight.mjs", "");
  writeFixtureFile(root, "scripts/verify-compose-static.mjs", "");
  writeFixtureFile(root, "scripts/verify-compose-runtime.mjs", "");
  writeFixtureFile(root, "scripts/verify-docker-image-pulls.mjs", "");
  writeFixtureFile(root, "scripts/runtime-admin-smoke.mjs", "");
  writeFixtureFile(root, "scripts/runtime-challenge-smoke.mjs", "");
  writeFixtureFile(root, "scripts/runtime-clear-smoke.mjs", "");
  writeFixtureFile(root, "scripts/runtime-smoke.mjs", "");
  writeFixtureFile(
    root,
    "docs/operations.md",
    [
      "SESSION_SECRET",
      "CLEAR_VIEW_TOKEN_SECRET",
      "CLAIM_TOKEN_SECRET",
      "INTERNAL_SERVICE_TOKEN",
      "FLAG_ENCRYPTION_KEY",
      "STUDENT_ID_ENCRYPTION_KEY",
      "postgres_password",
    ].join("\n"),
  );

  writeFixtureFile(root, "packages/shared/package.json", "{}");
  writeFixtureFile(
    root,
    "packages/shared/src/index.ts",
    `${challengeIds.map((id) => `"FLAG-${id}"`).join("\n")}\n`,
  );
  writeFixtureFile(root, "packages/config/package.json", "{}");
  writeFixtureFile(
    root,
    "packages/config/src/index.ts",
    [
      "STUDENT_ID_ENCRYPTION_KEY",
      "STUDENT_ID_HASH_PEPPER",
      "FLAG_ENCRYPTION_KEY",
      "FLAG_HASH_PEPPER",
      "SESSION_SECRET",
      "CLEAR_VIEW_TOKEN_SECRET",
      "INTERNAL_SERVICE_TOKEN",
    ].join("\n"),
  );
  writeFixtureFile(root, "packages/db/package.json", "{}");
  writeFixtureFile(
    root,
    "packages/db/src/schema.ts",
    [
      '"users"',
      '"sessions"',
      '"cookie_consents"',
      '"challenges"',
      '"challenge_flags"',
      '"challenge_artifacts"',
      '"final_submissions"',
      '"final_submission_results"',
      '"clears"',
      '"clear_view_tokens"',
      '"audit_logs"',
    ].join("\n"),
  );
  writeFixtureFile(root, "packages/db/drizzle.config.ts", "");
  writeFixtureFile(
    root,
    "packages/db/drizzle/0000_initial_schema.sql",
    [
      "CREATE TABLE IF NOT EXISTS \"users\"",
      "CREATE TABLE IF NOT EXISTS \"sessions\"",
      "CREATE TABLE IF NOT EXISTS \"cookie_consents\"",
      "CREATE TABLE IF NOT EXISTS \"challenges\"",
      "CREATE TABLE IF NOT EXISTS \"challenge_flags\"",
      "CREATE TABLE IF NOT EXISTS \"challenge_artifacts\"",
      "CREATE TABLE IF NOT EXISTS \"final_submissions\"",
      "CREATE TABLE IF NOT EXISTS \"final_submission_results\"",
      "CREATE TABLE IF NOT EXISTS \"clears\"",
      "CREATE TABLE IF NOT EXISTS \"clear_view_tokens\"",
      "CREATE TABLE IF NOT EXISTS \"audit_logs\"",
      '"users_student_id_hash_key"',
      '"sessions_session_hash_key"',
      '"sessions_user_id_idx"',
      '"sessions_last_seen_idx"',
      '"challenges_flag_id_key"',
      '"challenge_flags_user_challenge_key"',
      '"clears_user_id_key"',
    ].join("\n"),
  );

  writeFixtureFile(
    root,
    "infra/docker/docker-compose.yml",
    `services:
  nginx:
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
  frontend:
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "node"]
  backend:
    expose:
      - "8080"
    healthcheck:
      test: ["CMD", "node"]
  postgres:
    expose:
      - "5432"
  redis:
    expose:
      - "6379"
${challengeIds.map((id) => `  challenge-${id}:\n    expose:\n      - "8080"\n    healthcheck:\n      test: ["CMD", "node"]`).join("\n")}
networks:
  ctf_public:
  ctf_app:
  ctf_internal:
  ctf_challenges:
`,
  );
  writeFixtureFile(
    root,
    "infra/nginx/nginx.conf",
    [
      'proxy_set_header X-User-Id "";',
      'proxy_set_header X-Student-Id "";',
      'proxy_set_header X-Forwarded-User "";',
      'proxy_set_header X-Internal-Service "";',
      'proxy_set_header X-Internal-Token "";',
      "location /internal/ { return 404; }",
      "location /api/ { proxy_pass http://backend; }",
      ...servicePaths.map(
        (servicePath, index) =>
          `location ${servicePath} { proxy_pass http://challenge${String(index + 1).padStart(2, "0")}/; }`,
      ),
      "location / { proxy_pass http://frontend; }",
    ].join("\n"),
  );

  for (const id of challengeIds) {
    writeFixtureFile(root, `challenge-services/challenge-${id}/package.json`, "{}");
    writeFixtureFile(root, `challenge-services/challenge-${id}/Dockerfile`, "FROM node\n");
    writeFixtureFile(root, `challenge-services/challenge-${id}/src/server.ts`, "");
  }

  return root;
}

function runVerifier(cwd) {
  try {
    execFileSync(process.execPath, [verifierPath], { cwd, encoding: "utf8", stdio: "pipe" });
    return { status: 0, output: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("verify-workspace rejects backend packages without migration and seed runtime commands", () => {
  const root = createBaseWorkspace();
  const result = runVerifier(root);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /backend package\.json must include "db:migrate"/);
  assert.match(result.output, /backend package\.json must include "db:seed"/);
  assert.match(result.output, /backend Dockerfile must include packages\/db\/drizzle/);
  assert.doesNotMatch(result.output, /initial DB migration must include CREATE TABLE/);
});

test("verify-workspace rejects runtime Dockerfiles that need pnpm at container start", () => {
  const root = createBaseWorkspace();
  writeFixtureFile(
    root,
    "apps/backend/package.json",
    JSON.stringify({ scripts: { "db:migrate": "node dist/database/migrate.js", "db:seed": "node dist/database/seed.js" } }),
  );
  writeFixtureFile(
    root,
    "apps/backend/Dockerfile",
    'FROM node\nCOPY --from=build /app/packages/db/drizzle ./packages/db/drizzle\nCMD ["pnpm", "--filter", "backend", "start:prod"]\n',
  );
  writeFixtureFile(root, "apps/frontend/Dockerfile", 'FROM node\nCMD ["pnpm", "--filter", "frontend", "start"]\n');

  const result = runVerifier(root);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /backend Dockerfile must start production without pnpm/);
  assert.match(result.output, /frontend Dockerfile must start production without pnpm/);
});
