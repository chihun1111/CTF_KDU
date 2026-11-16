import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXPECTED_SERVICES = [
  "nginx",
  "frontend",
  "backend",
  "postgres",
  "redis",
  "challenge-01",
  "challenge-02",
  "challenge-03",
  "challenge-04",
  "challenge-05",
  "challenge-06",
  "challenge-07",
  "challenge-08",
];

const BACKEND_SECRETS = [
  "flag_encryption_key",
  "flag_hash_pepper",
  "student_id_encryption_key",
  "student_id_hash_pepper",
  "session_secret",
  "clear_view_token_secret",
  "claim_token_secret",
  "internal_service_token_01",
  "internal_service_token_02",
  "internal_service_token_03",
  "internal_service_token_04",
  "internal_service_token_05",
  "internal_service_token_06",
  "internal_service_token_07",
  "internal_service_token_08",
  "postgres_password",
];

const CHALLENGE_SERVICES = [
  "challenge-01",
  "challenge-02",
  "challenge-03",
  "challenge-04",
  "challenge-05",
  "challenge-06",
  "challenge-07",
  "challenge-08",
];

const INTERNAL_SERVICE_TOKEN_SECRETS = CHALLENGE_SERVICES.map((serviceName) =>
  `internal_service_token_${serviceName.slice(-2)}`,
);

const SECRET_FORBIDDEN_IN_CHALLENGES = [
  "flag_encryption_key",
  "flag_hash_pepper",
  "student_id_encryption_key",
  "student_id_hash_pepper",
  "session_secret",
  "clear_view_token_secret",
  "claim_token_secret",
  "postgres_password",
];

const failures = [];

function parseArgs(argv) {
  const options = {
    composeFile: "infra/docker/docker-compose.yml",
    envFile: ".env.production",
    configJson: null,
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
    failures.push(`Unknown argument: ${arg}`);
  }
  return options;
}

function readConfig(options) {
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
    return { services: {}, networks: {} };
  }
  return JSON.parse(result.stdout);
}

function serviceNetworks(service) {
  if (Array.isArray(service?.networks)) {
    return service.networks;
  }
  return Object.keys(service?.networks ?? {});
}

function serviceSecrets(service) {
  return (service?.secrets ?? []).map((secret) => (typeof secret === "string" ? secret : secret.source)).filter(Boolean);
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const options = parseArgs(process.argv.slice(2));
const config = readConfig(options);
const services = config.services ?? {};
const networks = config.networks ?? {};
const secrets = config.secrets ?? {};

for (const serviceName of EXPECTED_SERVICES) {
  assert(services[serviceName], `Missing compose service: ${serviceName}`);
}

const declaredChallengeServices = Object.keys(services)
  .filter((serviceName) => /^challenge-\d+$/.test(serviceName))
  .sort();
assert(
  JSON.stringify(declaredChallengeServices) === JSON.stringify([...CHALLENGE_SERVICES].sort()),
  "compose must declare exactly the eight active challenge services",
);

for (const tokenSecret of INTERNAL_SERVICE_TOKEN_SECRETS) {
  assert(secrets[tokenSecret], `compose must define ${tokenSecret}`);
}

for (const [name, service] of Object.entries(services)) {
  if (name !== "nginx") {
    assert(!service.ports || service.ports.length === 0, `Only nginx may publish host ports: ${name}`);
  }
}
assert((services.nginx?.ports ?? []).length === 1, "nginx must publish exactly one host port");

for (const networkName of ["ctf_app", "ctf_internal", "ctf_challenges"]) {
  assert(networks[networkName]?.internal === true, `${networkName} must be an internal network`);
}
assert(networks.ctf_public?.internal !== true, "ctf_public must be the only non-internal public network");

assert(serviceNetworks(services.nginx).includes("ctf_public"), "nginx must attach to ctf_public");
assert(serviceNetworks(services.backend).includes("ctf_internal"), "backend must attach to ctf_internal");
assert(serviceNetworks(services.backend).includes("ctf_challenges"), "backend must attach to ctf_challenges");
assert(serviceNetworks(services.postgres).length === 1 && serviceNetworks(services.postgres).includes("ctf_internal"), "postgres must stay on ctf_internal only");
assert(serviceNetworks(services.redis).length === 1 && serviceNetworks(services.redis).includes("ctf_internal"), "redis must stay on ctf_internal only");

for (const secret of BACKEND_SECRETS) {
  assert(serviceSecrets(services.backend).includes(secret), `backend must receive ${secret}`);
}

for (const challenge of CHALLENGE_SERVICES) {
  const secrets = serviceSecrets(services[challenge]);
  const environment = services[challenge]?.environment ?? {};
  const expectedTokenSecret = `internal_service_token_${challenge.slice(-2)}`;
  assert(secrets.includes(expectedTokenSecret), `${challenge} must receive ${expectedTokenSecret}`);
  for (const tokenSecret of INTERNAL_SERVICE_TOKEN_SECRETS) {
    if (tokenSecret !== expectedTokenSecret) {
      assert(!secrets.includes(tokenSecret), `${challenge} must not receive ${tokenSecret}`);
    }
  }
  assert(
    environment.INTERNAL_SERVICE_TOKEN_FILE === `/run/secrets/${expectedTokenSecret}`,
    `${challenge} must read only ${expectedTokenSecret} through INTERNAL_SERVICE_TOKEN_FILE`,
  );
  assert(!("INTERNAL_SERVICE_TOKEN" in environment), `${challenge} must not receive a raw INTERNAL_SERVICE_TOKEN value`);
  for (const forbidden of SECRET_FORBIDDEN_IN_CHALLENGES) {
    assert(!secrets.includes(forbidden), `${challenge} must not receive ${forbidden}`);
  }
  assert(serviceNetworks(services[challenge]).includes("ctf_challenges"), `${challenge} must attach to ctf_challenges`);
}

const sqliteService = services["challenge-07"];
assert(sqliteService?.read_only === true, "challenge-07 must have a read-only root filesystem");
const sqliteState = (sqliteService?.tmpfs ?? []).find((entry) => typeof entry === "string" && entry.startsWith("/app/state:"));
assert(
  typeof sqliteState === "string" && ["size=64m", "uid=1000", "gid=1000", "mode=0700", "noexec", "nosuid", "nodev"].every((option) => sqliteState.split(/[:,]/).includes(option)),
  "challenge-07 state must be a private bounded tmpfs",
);
if (failures.length > 0) {
  console.error("Compose static verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Compose static verification passed.");
