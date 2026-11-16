import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const failures = [];

function parseArgs(argv) {
  const options = {
    composeFile: "infra/docker/docker-compose.yml",
    envFile: ".env.production",
    configJson: null,
    psJson: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (arg === "--config-json") {
      options.configJson = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--ps-json") {
      options.psJson = argv[index + 1];
      index += 1;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  return options;
}

function readComposeConfig(options) {
  if (options.configJson) {
    return JSON.parse(readFileSync(options.configJson, "utf8"));
  }
  const result = spawnSync("docker", ["compose", "-f", options.composeFile, "--env-file", options.envFile, "config", "--format", "json"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    failures.push(`docker compose config failed with exit code ${result.status ?? "unknown"}`);
    return { services: {} };
  }
  return JSON.parse(result.stdout);
}

function parsePsOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function readComposePs(options) {
  if (options.psJson) {
    return parsePsOutput(readFileSync(options.psJson, "utf8"));
  }
  const result = spawnSync(
    "docker",
    ["compose", "-f", options.composeFile, "--env-file", options.envFile, "ps", "--all", "--format", "json"],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );
  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    failures.push(`docker compose ps json failed with exit code ${result.status ?? "unknown"}`);
    return [];
  }
  return parsePsOutput(result.stdout);
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const options = parseArgs(process.argv.slice(2));
const config = readComposeConfig(options);
const psRows = readComposePs(options);
const expectedServices = Object.keys(config.services ?? {}).sort();
const rowsByService = new Map();
for (const row of psRows) {
  const rows = rowsByService.get(row.Service) ?? [];
  rows.push(row);
  rowsByService.set(row.Service, rows);
}

assert(expectedServices.length > 0, "compose config must define services");

for (const service of expectedServices) {
  const rows = rowsByService.get(service);
  assert(rows?.length, `Missing running compose container: ${service}`);
  if (!rows?.length) {
    continue;
  }
  const healthcheck = config.services[service]?.healthcheck;
  const requiresHealth = healthcheck && healthcheck.disable !== true && healthcheck.test?.[0] !== "NONE";
  for (const row of rows) {
    assert(row.State === "running", `${service} is ${row.State || "unknown"} instead of running`);
    if (requiresHealth || (typeof row.Health === "string" && row.Health.length > 0)) {
      assert(row.Health === "healthy", `${service} health is ${row.Health || "missing"} instead of healthy`);
    }
  }
}

if (failures.length > 0) {
  console.error("Compose runtime verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Compose runtime verification passed.");
