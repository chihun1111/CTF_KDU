import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function rel(filePath) {
  return path.join(root, filePath);
}

function fail(message) {
  failures.push(message);
}

function assertFile(filePath) {
  if (!existsSync(rel(filePath))) {
    fail(`Missing required file: ${filePath}`);
  }
}

function assertDir(dirPath) {
  if (!existsSync(rel(dirPath))) {
    fail(`Missing required directory: ${dirPath}`);
  }
}

function readRequired(filePath) {
  assertFile(filePath);
  if (!existsSync(rel(filePath))) {
    return "";
  }
  return readFileSync(rel(filePath), "utf8");
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) {
    fail(`${context} must include ${needle}`);
  }
}

function parseServiceBlocks(composeText) {
  const blocks = new Map();
  const lines = composeText.split(/\r?\n/);
  let inServices = false;
  let currentName = null;
  let currentLines = [];

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }

    if (!inServices) {
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:\s*$/.test(line) && !line.startsWith(" ")) {
      break;
    }

    const serviceMatch = /^  ([a-zA-Z0-9_-]+):\s*$/.exec(line);
    if (serviceMatch) {
      if (currentName) {
        blocks.set(currentName, currentLines.join("\n"));
      }
      currentName = serviceMatch[1];
      currentLines = [line];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  if (currentName) {
    blocks.set(currentName, currentLines.join("\n"));
  }

  return blocks;
}

const requiredRootFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  ".env.example",
  ".gitignore",
  ".dockerignore",
];

const requiredDirs = [
  "apps/frontend",
  "apps/backend",
  "packages/shared",
  "packages/config",
  "packages/db",
  "infra/docker",
  "infra/nginx",
];

const challengeIds = Array.from({ length: 8 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);
const servicePaths = [
  "/challenges/01/",
  "/challenges/02/",
  "/challenges/03/",
  "/challenges/04/",
  "/challenges/05/",
  "/challenges/06/",
  "/challenges/07/",
  "/challenges/08/",
];

for (const filePath of requiredRootFiles) {
  assertFile(filePath);
}

for (const dirPath of requiredDirs) {
  assertDir(dirPath);
}

for (const id of challengeIds) {
  assertDir(`challenge-services/challenge-${id}`);
  assertFile(`challenge-services/challenge-${id}/package.json`);
  assertFile(`challenge-services/challenge-${id}/Dockerfile`);
  assertFile(`challenge-services/challenge-${id}/src/server.ts`);
}

for (const filePath of [
  "apps/frontend/package.json",
  "apps/frontend/Dockerfile",
  "apps/frontend/app/page.tsx",
  "apps/frontend/app/health/route.ts",
  "apps/backend/package.json",
  "apps/backend/Dockerfile",
  "apps/backend/src/main.ts",
  "apps/backend/src/challenges/challenges.module.ts",
  "apps/backend/src/health.controller.ts",
  "packages/shared/package.json",
  "packages/shared/src/index.ts",
  "packages/config/package.json",
  "packages/config/src/index.ts",
  "packages/db/package.json",
  "packages/db/src/schema.ts",
  "packages/db/drizzle.config.ts",
  "packages/db/drizzle/0000_initial_schema.sql",
  "infra/docker/docker-compose.yml",
  "infra/nginx/nginx.conf",
  "docs/operations.md",
  "scripts/verify-sensitive-artifacts.mjs",
  "scripts/verify-runtime-secrets.mjs",
  "scripts/generate-runtime-secrets.mjs",
  "scripts/deployment-preflight.mjs",
  "scripts/verify-compose-static.mjs",
  "scripts/verify-compose-runtime.mjs",
  "scripts/verify-docker-image-pulls.mjs",
  "scripts/verify-ui-doc-policy.mjs",
  "scripts/runtime-admin-smoke.mjs",
  "scripts/runtime-challenge-smoke.mjs",
  "scripts/runtime-clear-smoke.mjs",
  "scripts/runtime-smoke.mjs",
]) {
  assertFile(filePath);
}

const workspace = readRequired("pnpm-workspace.yaml");
for (const pattern of ["apps/*", "packages/*", "challenge-services/*"]) {
  assertIncludes(workspace, pattern, "pnpm workspace");
}

const rootPackage = readRequired("package.json");
assertIncludes(rootPackage, "\"packageManager\": \"pnpm@", "root package.json");
assertIncludes(rootPackage, "\"preflight:deploy\"", "root package.json");
assertIncludes(rootPackage, "\"smoke:admin\"", "root package.json");
assertIncludes(rootPackage, "\"smoke:challenges\"", "root package.json");
assertIncludes(rootPackage, "\"smoke:clear\"", "root package.json");
assertIncludes(rootPackage, "\"smoke:runtime\"", "root package.json");
assertIncludes(rootPackage, "\"verify:compose\"", "root package.json");
assertIncludes(rootPackage, "\"verify:compose-runtime\"", "root package.json");
assertIncludes(rootPackage, "\"verify:images\"", "root package.json");
assertIncludes(rootPackage, "\"verify:ui\"", "root package.json");
assertIncludes(rootPackage, "\"verify:workspace\"", "root package.json");
assertIncludes(rootPackage, "\"verify:sensitive\"", "root package.json");
assertIncludes(rootPackage, "\"verify:secrets\"", "root package.json");
assertIncludes(rootPackage, "\"secrets:generate\"", "root package.json");

const backendPackage = readRequired("apps/backend/package.json");
assertIncludes(backendPackage, "\"db:migrate\"", "backend package.json");
assertIncludes(backendPackage, "\"db:seed\"", "backend package.json");

const backendDockerfile = readRequired("apps/backend/Dockerfile");
assertIncludes(backendDockerfile, "packages/db/drizzle", "backend Dockerfile");
assertIncludes(backendDockerfile, "apps/backend/node_modules", "backend Dockerfile");
assertIncludes(backendDockerfile, "packages/config/node_modules", "backend Dockerfile");
assertIncludes(backendDockerfile, "packages/db/node_modules", "backend Dockerfile");
assertIncludes(backendDockerfile, "packages/shared/node_modules", "backend Dockerfile");
assertIncludes(backendDockerfile, 'CMD ["node", "apps/backend/dist/main.js"]', "backend Dockerfile must start production without pnpm");

const frontendDockerfile = readRequired("apps/frontend/Dockerfile");
assertIncludes(frontendDockerfile, 'CMD ["node", "apps/frontend/node_modules/next/dist/bin/next", "start", "apps/frontend", "-H", "0.0.0.0", "-p", "3000"]', "frontend Dockerfile must start production without pnpm");

const dockerignore = readRequired(".dockerignore");
for (const ignoredPath of [
  ".env",
  ".env.*",
  "secrets/runtime-only",
  "Docs/problems",
  "Docs/development/flags",
]) {
  assertIncludes(dockerignore, ignoredPath, ".dockerignore");
}

const secretRotationDoc = readRequired("docs/operations.md");
for (const rotationTerm of [
  "SESSION_SECRET",
  "CLEAR_VIEW_TOKEN_SECRET",
  "CLAIM_TOKEN_SECRET",
  "INTERNAL_SERVICE_TOKEN",
  "FLAG_ENCRYPTION_KEY",
  "STUDENT_ID_ENCRYPTION_KEY",
  "postgres_password",
]) {
  assertIncludes(secretRotationDoc, rotationTerm, "secret rotation runbook");
}

const sharedSource = readRequired("packages/shared/src/index.ts");
for (const flagId of challengeIds.map((id) => `FLAG-${id}`)) {
  assertIncludes(sharedSource, flagId, "shared challenge metadata");
}

const configSource = readRequired("packages/config/src/index.ts");
for (const secretName of [
  "STUDENT_ID_ENCRYPTION_KEY",
  "STUDENT_ID_HASH_PEPPER",
  "FLAG_ENCRYPTION_KEY",
  "FLAG_HASH_PEPPER",
  "SESSION_SECRET",
  "CLEAR_VIEW_TOKEN_SECRET",
  "INTERNAL_SERVICE_TOKEN",
]) {
  assertIncludes(configSource, secretName, "config secret registry");
}

const dbSchema = readRequired("packages/db/src/schema.ts");
const dbMigration = readRequired("packages/db/drizzle/0000_initial_schema.sql");
for (const tableName of [
  "users",
  "sessions",
  "cookie_consents",
  "challenges",
  "challenge_flags",
  "challenge_artifacts",
  "final_submissions",
  "final_submission_results",
  "clears",
  "clear_view_tokens",
  "audit_logs",
]) {
  assertIncludes(dbSchema, `"${tableName}"`, "Drizzle schema tables");
  const createTablePattern = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+"${tableName}"`);
  if (!createTablePattern.test(dbMigration)) {
    fail(`initial DB migration must include CREATE TABLE for ${tableName}`);
  }
}

for (const indexName of [
  "users_student_id_hash_key",
  "sessions_session_hash_key",
  "sessions_user_id_idx",
  "sessions_last_seen_idx",
  "challenges_flag_id_key",
  "challenge_flags_user_challenge_key",
  "clears_user_id_key",
]) {
  assertIncludes(dbMigration, `"${indexName}"`, "initial DB migration indexes");
}

for (const forbiddenColumn of [
  '"student_id"',
  '"flag"',
  '"flag_plaintext"',
  '"submitted_flag"',
  '"session_token"',
  '"clear_token"',
  '"claim_token"',
]) {
  if (dbMigration.includes(forbiddenColumn)) {
    fail(`initial DB migration must not store forbidden plaintext/token column ${forbiddenColumn}`);
  }
}

const compose = readRequired("infra/docker/docker-compose.yml");
const serviceBlocks = parseServiceBlocks(compose);
const expectedServices = [
  "nginx",
  "frontend",
  "backend",
  "postgres",
  "redis",
  ...challengeIds.map((id) => `challenge-${id}`),
];

for (const service of expectedServices) {
  if (!serviceBlocks.has(service)) {
    fail(`docker-compose.yml must define service ${service}`);
  }
}

const nginxBlock = serviceBlocks.get("nginx") ?? "";
if (!/^\s+ports:\s*$/m.test(nginxBlock)) {
  fail("nginx must be the only service with host ports");
}
assertIncludes(nginxBlock, "condition: service_healthy", "nginx dependencies");

for (const [service, block] of serviceBlocks) {
  if (service !== "nginx" && /^\s+ports:\s*$/m.test(block)) {
    fail(`${service} must not publish host ports`);
  }
}

for (const service of ["backend", "frontend"]) {
  assertIncludes(serviceBlocks.get(service) ?? "", "healthcheck:", `${service} compose service`);
}

const challengeServiceAnchor = /^x-challenge-service:[\s\S]*?^services:/m.exec(compose)?.[0] ?? "";
const challengeAnchorHasHealthcheck = challengeServiceAnchor.includes("healthcheck:");
for (const id of challengeIds) {
  const service = `challenge-${id}`;
  const block = serviceBlocks.get(service) ?? "";
  if (!block.includes("healthcheck:") && !(block.includes("<<: *challenge-service") && challengeAnchorHasHealthcheck)) {
    fail(`${service} compose service must include healthcheck:`);
  }
}

for (const network of [
  "ctf_public",
  "ctf_app",
  "ctf_internal",
  "ctf_challenges",
]) {
  assertIncludes(compose, `${network}:`, "docker-compose networks");
}

const nginx = readRequired("infra/nginx/nginx.conf");
for (const header of [
  "X-User-Id",
  "X-Student-Id",
  "X-Forwarded-User",
  "X-Internal-Service",
  "X-Internal-Token",
]) {
  assertIncludes(nginx, `proxy_set_header ${header} "";`, "nginx trusted header scrub");
}

assertIncludes(nginx, "location /internal/", "nginx internal route block");
assertIncludes(nginx, "return 404;", "nginx internal route block");
assertIncludes(nginx, "location /api/", "nginx backend route");

for (const servicePath of servicePaths) {
  assertIncludes(nginx, `location ${servicePath}`, "nginx service routes");
}

const declaredChallengeRoutes = [...nginx.matchAll(/^\s*location\s+([^\s{]+)\s*\{/gm)]
  .map((match) => match[1])
  .filter((route) => !["/", "/api/", "/internal/"].includes(route));
if (JSON.stringify(declaredChallengeRoutes) !== JSON.stringify(servicePaths)) {
  fail("nginx must declare exactly the eight active challenge service routes");
}

for (const [index, servicePath] of servicePaths.entries()) {
  const challengeId = String(index + 1).padStart(2, "0");
  const escapedPath = servicePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routePattern = new RegExp(`location ${escapedPath}\\s*\\{\\s*proxy_pass http://challenge${challengeId}/;`);
  if (!routePattern.test(nginx)) {
    fail(`${servicePath} must proxy to challenge-${challengeId} with the public prefix stripped`);
  }
}

if (/\/api\/services\/[^\s/]+\/artifact/.test(nginx)) {
  fail("nginx must not register the legacy artifact download route");
}

const challengesModule = readRequired("apps/backend/src/challenges/challenges.module.ts");
for (const legacyRegistration of ["ChallengeArtifactController", "ChallengeArtifactService", "ChallengeArtifactDrizzleStore"]) {
  if (challengesModule.includes(legacyRegistration)) {
    fail(`ChallengesModule must not register legacy ${legacyRegistration}`);
  }
}

if (failures.length > 0) {
  console.error("Workspace verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Workspace verification passed.");
