import { randomBytes } from "node:crypto";
import { existsSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
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
  const options = {
    dir: "secrets/runtime-only",
    force: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") {
      const value = argv[index + 1];
      if (!value) {
        failures.push("--dir requires a path");
        continue;
      }
      options.dir = value;
      index += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  return {
    ...options,
    dir: path.isAbsolute(options.dir) ? options.dir : path.resolve(root, options.dir),
  };
}

function generateSecret(kind) {
  if (kind === "aes") {
    return randomBytes(32).toString("base64");
  }
  return randomBytes(32).toString("base64");
}

const options = parseArgs(process.argv.slice(2));

if (failures.length === 0) {
  mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  chmodSync(options.dir, 0o700);

  let generated = 0;
  let preserved = 0;

  for (const { file, kind } of SECRET_FILES) {
    const filePath = path.join(options.dir, file);
    if (existsSync(filePath) && !options.force) {
      preserved += 1;
      continue;
    }
    writeFileSync(filePath, `${generateSecret(kind)}\n`, { mode: 0o600 });
    chmodSync(filePath, 0o600);
    generated += 1;
  }

  console.log(`Generated ${generated} runtime secret files.`);
  if (preserved > 0) {
    console.log(`Preserved ${preserved} existing runtime secret files.`);
  }
}

if (failures.length > 0) {
  console.error("Runtime secret generation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
