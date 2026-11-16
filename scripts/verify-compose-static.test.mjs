import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(import.meta.dirname, "verify-compose-static.mjs");

function writeConfig(config) {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-compose-static-"));
  const file = path.join(dir, "compose.json");
  writeFileSync(file, JSON.stringify(config), "utf8");
  return file;
}

function baseConfig() {
  const challenge = (id) => ({
    expose: ["8080"],
    cap_drop: ["ALL"],
    cap_add: ["DAC_OVERRIDE"],
    security_opt: ["no-new-privileges:true"],
    networks: { ctf_challenges: null },
    secrets: [{ source: `internal_service_token_${id}` }],
    environment: {
      BACKEND_INTERNAL_URL: "http://backend:8080",
      INTERNAL_SERVICE_TOKEN_FILE: `/run/secrets/internal_service_token_${id}`,
    },
  });
  return {
    networks: {
      ctf_public: {},
      ctf_app: { internal: true },
      ctf_internal: { internal: true },
      ctf_challenges: { internal: true },
    },
    secrets: Object.fromEntries(
      [
        "internal_service_token_01",
        "internal_service_token_02",
        "internal_service_token_03",
        "internal_service_token_04",
        "internal_service_token_05",
        "internal_service_token_06",
        "internal_service_token_07",
        "internal_service_token_08",
      ].map((name) => [name, { file: `/run/secrets/${name}` }]),
    ),
    services: {
      nginx: {
        ports: [{ published: "80", target: 80 }],
        networks: { ctf_public: null, ctf_app: null, ctf_challenges: null },
      },
      frontend: { expose: ["3000"], networks: { ctf_app: null }, cap_drop: ["ALL"], security_opt: ["no-new-privileges:true"] },
      backend: {
        expose: ["8080"],
        cap_drop: ["ALL"],
        cap_add: ["DAC_OVERRIDE"],
        security_opt: ["no-new-privileges:true"],
        networks: { ctf_app: null, ctf_internal: null, ctf_challenges: null },
        secrets: [
          { source: "flag_encryption_key" },
          { source: "flag_hash_pepper" },
          { source: "student_id_encryption_key" },
          { source: "student_id_hash_pepper" },
          { source: "session_secret" },
          { source: "clear_view_token_secret" },
          { source: "claim_token_secret" },
          { source: "internal_service_token_01" },
          { source: "internal_service_token_02" },
          { source: "internal_service_token_03" },
          { source: "internal_service_token_04" },
          { source: "internal_service_token_05" },
          { source: "internal_service_token_06" },
          { source: "internal_service_token_07" },
          { source: "internal_service_token_08" },
          { source: "postgres_password" },
        ],
      },
      postgres: {
        expose: ["5432"],
        networks: { ctf_internal: null },
        secrets: [{ source: "postgres_password" }],
      },
      redis: { expose: ["6379"], networks: { ctf_internal: null } },
      "challenge-01": challenge("01"),
      "challenge-02": challenge("02"),
      "challenge-03": challenge("03"),
      "challenge-04": challenge("04"),
      "challenge-05": challenge("05"),
      "challenge-06": challenge("06"),
      "challenge-07": { ...challenge("07"), read_only: true, tmpfs: ["/app/state:size=64m,uid=1000,gid=1000,mode=0700,noexec,nosuid,nodev"] },
      "challenge-08": challenge("08"),
    },
  };
}

function run(config) {
  const configFile = writeConfig(config);
  try {
    const output = execFileSync(process.execPath, [scriptPath, "--config-json", configFile], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("verify-compose-static accepts the expected deployment boundary shape", () => {
  const result = run(baseConfig());

  assert.equal(result.status, 0);
  assert.match(result.output, /Compose static verification passed/);
});

test("verify-compose-static rejects host-published internals and challenge flag secrets", () => {
  const config = baseConfig();
  config.services.backend.ports = [{ published: "8080", target: 8080 }];
  config.services["challenge-01"].secrets.push({ source: "flag_encryption_key" });

  const result = run(config);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /Only nginx may publish host ports/);
  assert.match(result.output, /challenge-01 must not receive flag_encryption_key/);
});

test("verify-compose-static rejects network attachments that cross the deployment boundary", () => {
  for (const [name, network] of [["challenge-07", "ctf_internal"], ["challenge-01", "ctf_public"], ["frontend", "ctf_challenges"], ["backend", "ctf_public"]]) {
    const config = baseConfig();
    config.services[name].networks[network] = null;
    const result = run(config);
    assert.notEqual(result.status, 0, `${name} must not attach to ${network}`);
    assert.match(result.output, /network boundary/);
  }
});

test("verify-compose-static rejects host namespaces and privileged challenge containers", () => {
  for (const override of [{ network_mode: "host" }, { pid: "host" }, { ipc: "host" }, { privileged: true }, { cap_add: ["SYS_ADMIN"] }, { cap_drop: [] }, { security_opt: ["no-new-privileges:false"] }]) {
    const config = baseConfig();
    Object.assign(config.services["challenge-07"], override);
    const result = run(config);
    assert.notEqual(result.status, 0, `isolation bypass ${Object.keys(override)[0]} must be rejected`);
    assert.match(result.output, /isolation boundary/);
  }
});

test("verify-compose-static rejects sensitive challenge environment values and extra filesystem mounts", () => {
  for (const override of [
    { environment: { ...baseConfig().services["challenge-07"].environment, FLAG_ENCRYPTION_KEY: "fixture-only" } },
    { volumes: [{ type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock" }] },
    { volumes_from: ["backend:ro"] },
    { configs: [{ source: "unreviewed_config", target: "/app/extra.conf" }] },
    { secrets: [{ source: "internal_service_token_07" }, { source: "unreviewed_secret" }] },
  ]) {
    const config = baseConfig();
    Object.assign(config.services["challenge-07"], override);
    const result = run(config);
    assert.notEqual(result.status, 0, "challenge containers must receive only their expected secret and bounded state");
  }
});

test("verify-compose-static rejects unbounded SQLite state and a writable root", () => {
  const config = baseConfig();
  config.services["challenge-07"].read_only = false;
  config.services["challenge-07"].tmpfs = ["/app/state"];
  const result = run(config);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /read-only root filesystem/);
  assert.match(result.output, /private bounded tmpfs/);
});

test("verify-compose-static rejects extra or contradictory tmpfs state mounts", () => {
  const valid = baseConfig().services["challenge-07"].tmpfs[0];
  for (const tmpfs of [[valid, "/extra"], [valid, "/app/state:size=1g"], [`${valid},size=1g`], [`${valid},exec`]]) {
    const config = baseConfig();
    config.services["challenge-07"].tmpfs = tmpfs;
    const result = run(config);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /private bounded tmpfs/);
  }
  const config = baseConfig();
  config.services["challenge-01"].tmpfs = ["/extra"];
  assert.notEqual(run(config).status, 0);
});

test("verify-compose-static rejects cross-challenge token mounts", () => {
  const config = baseConfig();
  config.services["challenge-01"].secrets.push({ source: "internal_service_token_02" });

  const result = run(config);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /challenge-01 must not receive internal_service_token_02/);
});

test("verify-compose-static rejects a missing top-level challenge token secret", () => {
  const config = baseConfig();
  delete config.secrets.internal_service_token_08;

  const result = run(config);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /compose must define internal_service_token_08/);
});

test("verify-compose-static rejects raw challenge token environment values", () => {
  const config = baseConfig();
  config.services["challenge-03"].environment.INTERNAL_SERVICE_TOKEN = "raw-token";

  const result = run(config);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /challenge-03 must not receive a raw INTERNAL_SERVICE_TOKEN value/);
});

test("verify-compose-static rejects stale or extra challenge services", () => {
  const config = baseConfig();
  config.services["challenge-09"] = {
    expose: ["8080"],
    networks: { ctf_challenges: null },
    secrets: [{ source: "internal_service_token_09" }],
    environment: { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_09" },
  };

  const result = run(config);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /exactly the eight active challenge services/);
});

test("docker compose secrets can be relocated outside a space-containing workspace path", () => {
  const composeSource = readFileSync(path.resolve(import.meta.dirname, "../infra/docker/docker-compose.yml"), "utf8");

  assert.match(composeSource, /\$\{RUNTIME_SECRETS_DIR:-\.\.\/\.\.\/secrets\/runtime-only\}\/postgres_password/);
});
