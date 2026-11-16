import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadDeploymentConfig } from "./deployment-config.mjs";

const root = process.cwd();
const failures = [];

function parseArgs(argv) {
  const options = {
    envFile: ".env.production",
    composeFile: "infra/docker/docker-compose.yml",
    skipDocker: false,
    skipImagePulls: false,
    skipSecrets: false,
    imageTimeoutMs: "120000",
    backendLog: null,
    dbDump: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      options.envFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--backend-log") {
      options.backendLog = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--db-dump") {
      options.dbDump = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--image-timeout-ms") {
      options.imageTimeoutMs = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--skip-docker") {
      options.skipDocker = true;
      continue;
    }
    if (arg === "--skip-image-pulls") {
      options.skipImagePulls = true;
      continue;
    }
    if (arg === "--skip-secrets") {
      options.skipSecrets = true;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  return options;
}

function run(label, command, args, options = {}) {
  console.log(`\n[preflight] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120_000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    const message = `${label} failed with exit code ${result.status ?? "unknown"}`;
    if (options.optional) {
      failures.push(message);
      return;
    }
    failures.push(message);
  }
}

const options = parseArgs(process.argv.slice(2));

if (!options.composeFile) {
  failures.push("--compose-file requires a path");
}
if (!options.envFile) {
  failures.push("--env-file requires a path");
}
if (!options.imageTimeoutMs) {
  failures.push("--image-timeout-ms requires a value");
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

let deployment;
try {
  deployment = loadDeploymentConfig({ root, composeFile: options.composeFile, envFile: options.envFile });
} catch (error) {
  console.error(`Deployment configuration invalid: ${error.code ?? error.message}`);
  process.exit(1);
}

run("workspace structure", "pnpm", ["verify:workspace"]);

if (!options.skipSecrets) {
  run("runtime secrets", "pnpm", ["verify:secrets", "--dir", deployment.runtimeSecretsDir]);
}

run("frontend and optional runtime sensitive scan", "pnpm", [
  "verify:sensitive",
  ...(options.backendLog ? ["--backend-log", options.backendLog] : []),
  ...(options.dbDump ? ["--db-dump", options.dbDump] : []),
]);

if (!options.skipDocker) {
  run("docker daemon", "docker", ["info"]);
  const composeArgs = ["compose", "-f", options.composeFile];
  if (existsSync(path.resolve(root, options.envFile))) {
    composeArgs.push("--env-file", options.envFile);
  } else {
    failures.push(`Missing env file: ${options.envFile}`);
  }
  run("docker compose config", "docker", [...composeArgs, "config"]);
  run("docker compose static policy", "pnpm", [
    "verify:compose",
    "--compose-file",
    options.composeFile,
    "--env-file",
    options.envFile,
  ]);
  if (!options.skipImagePulls) {
    run("docker image pulls", "pnpm", ["verify:images", "--timeout-ms", options.imageTimeoutMs]);
  }
  run("docker compose ps", "docker", [...composeArgs, "ps"]);
  run("docker compose runtime policy", "pnpm", [
    "verify:compose-runtime",
    "--compose-file",
    options.composeFile,
    "--env-file",
    options.envFile,
  ]);
}

if (failures.length > 0) {
  console.error("\nDeployment preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nDeployment preflight passed.");
