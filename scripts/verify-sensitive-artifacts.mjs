import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const scanned = [];
const skipped = [];

const FRONTEND_SCAN_PATHS = [
  "apps/frontend/app",
  "apps/frontend/.next/static",
  "apps/frontend/.next/server/app",
  "apps/frontend/.next/server/chunks",
];

const FORBIDDEN_PATTERNS = [
  { name: "flag literal", pattern: /KDUCTF\{/ },
  { name: "student id encryption key name", pattern: /STUDENT_ID_ENCRYPTION_KEY/ },
  { name: "student id hash pepper name", pattern: /STUDENT_ID_HASH_PEPPER/ },
  { name: "flag encryption key name", pattern: /FLAG_ENCRYPTION_KEY/ },
  { name: "flag hash pepper name", pattern: /FLAG_HASH_PEPPER/ },
  { name: "session secret name", pattern: /SESSION_SECRET/ },
  { name: "clear view token secret name", pattern: /CLEAR_VIEW_TOKEN_SECRET/ },
  { name: "claim token secret name", pattern: /CLAIM_TOKEN_SECRET/ },
  { name: "internal service token secret name", pattern: /INTERNAL_SERVICE_TOKEN/ },
  { name: "session cookie material", pattern: /ctf_session|sessionToken/ },
  { name: "clear cookie material", pattern: /ctf_clear_once|clearToken/ },
  { name: "claim token material", pattern: /claimToken/ },
  { name: "legacy artifact link", pattern: /artifactHref|artifactUrl/ },
  { name: "legacy claim link", pattern: /claimHref|claimUrl/ },
  {
    name: "raw admin identity or legacy metric field",
    pattern: /\b(?:userId|adminUserId|targetUserId|maskedStudentId|releasedByAdminUserId|artifactGeneratedCount|artifactFailureCountLast10m|claimVerifyFailureCountLast10m|artifactQueue)\b/,
  },
  { name: "query identity material", pattern: /studentId=|userId=|\?session=|\?userId=/ },
  { name: "submitted flag field", pattern: /submittedFlag/ },
];

function rel(filePath) {
  return path.resolve(root, filePath);
}

function parseArgs(argv) {
  const extraFiles = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file" || arg === "--backend-log" || arg === "--db-dump") {
      const value = argv[index + 1];
      if (!value) {
        failures.push(`${arg} requires a path`);
        continue;
      }
      extraFiles.push(value);
      index += 1;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  return extraFiles;
}

function* walk(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const stat = statSync(filePath);
  if (stat.isFile()) {
    yield filePath;
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(filePath)) {
    if (entry === "node_modules") {
      continue;
    }
    yield* walk(path.join(filePath, entry));
  }
}

function scanFile(filePath) {
  scanned.push(path.relative(root, filePath));
  let body;
  try {
    body = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(body)) {
      failures.push(`${path.relative(root, filePath)} contains forbidden ${name}`);
    }
  }
}

const extraFiles = parseArgs(process.argv.slice(2));

for (const scanPath of FRONTEND_SCAN_PATHS) {
  const absolute = rel(scanPath);
  if (!existsSync(absolute)) {
    skipped.push(scanPath);
    continue;
  }
  for (const filePath of walk(absolute)) {
    scanFile(filePath);
  }
}

for (const filePath of extraFiles) {
  const absolute = path.isAbsolute(filePath) ? filePath : rel(filePath);
  if (!existsSync(absolute)) {
    failures.push(`Missing scan input: ${filePath}`);
    continue;
  }
  for (const candidate of walk(absolute)) {
    scanFile(candidate);
  }
}

if (failures.length > 0) {
  console.error("Sensitive artifact verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Sensitive artifact verification passed. Scanned ${scanned.length} files.`);
if (skipped.length > 0) {
  console.log(`Skipped missing optional paths: ${skipped.join(", ")}`);
}
