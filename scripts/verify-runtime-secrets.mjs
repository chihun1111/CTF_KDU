import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const SECRET_FILES = [
  { file: "student_id_encryption_key", kind: "aes" },
  { file: "student_id_hash_pepper", kind: "long" },
  { file: "flag_encryption_key", kind: "aes" },
  { file: "flag_hash_pepper", kind: "long" },
  { file: "session_secret", kind: "long" },
  { file: "clear_view_token_secret", kind: "long" },
  { file: "claim_token_secret", kind: "long" },
  { file: "internal_service_token_01", kind: "long" },
  { file: "internal_service_token_02", kind: "long" },
  { file: "internal_service_token_03", kind: "long" },
  { file: "internal_service_token_04", kind: "long" },
  { file: "internal_service_token_05", kind: "long" },
  { file: "internal_service_token_06", kind: "long" },
  { file: "internal_service_token_07", kind: "long" },
  { file: "internal_service_token_08", kind: "long" },
  { file: "postgres_password", kind: "long" },
];

function parseArgs(argv) {
  let dir = "secrets/runtime-only";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") {
      const value = argv[index + 1];
      if (!value) {
        failures.push("--dir requires a path");
        continue;
      }
      dir = value;
      index += 1;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  return path.isAbsolute(dir) ? dir : path.resolve(root, dir);
}

function isBase64Aes256(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === 32 && decoded.toString("base64") === value;
}

function isOwnerOnlyMode(mode) {
  return (mode & 0o077) === 0;
}

const secretDir = parseArgs(process.argv.slice(2));

if (!existsSync(secretDir)) {
  failures.push(`Missing runtime secret directory: ${path.relative(root, secretDir)}`);
} else if (!statSync(secretDir).isDirectory()) {
  failures.push(`Runtime secret path is not a directory: ${path.relative(root, secretDir)}`);
}

const usedValues = new Set();
for (const { file, kind } of SECRET_FILES) {
  const filePath = path.join(secretDir, file);
  if (!existsSync(filePath)) {
    failures.push(`Missing runtime secret file: ${file}`);
    continue;
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    failures.push(`Runtime secret is not a file: ${file}`);
    continue;
  }
  if (!isOwnerOnlyMode(stat.mode)) {
    failures.push(`Runtime secret must not be group/world-readable: ${file}`);
  }
  const value = readFileSync(filePath, "utf8").trim();
  if (value && usedValues.has(value)) {
    failures.push(`Runtime secret must be unique: ${file}`);
  }
  usedValues.add(value);
  if (kind === "aes" && !isBase64Aes256(value)) {
    failures.push(`Runtime secret must be a base64-encoded 32-byte AES key: ${file}`);
  }
  if (kind === "long" && value.length < 32) {
    failures.push(`Runtime secret must be at least 32 characters: ${file}`);
  }
}

if (failures.length > 0) {
  console.error("Runtime secret verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Runtime secret verification passed for ${path.relative(root, secretDir) || "."}.`);
