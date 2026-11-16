import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadDeploymentConfig } from "./deployment-config.mjs";

function fixture(t, publicBaseUrl = "http://localhost:8080") {
  const root = mkdtempSync(path.join(tmpdir(), "ctf-deployment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "infra/nginx"), { recursive: true });
  writeFileSync(path.join(root, "infra/nginx/nginx.conf"), "events {}\n");
  writeFileSync(path.join(root, ".env.production"), `PUBLIC_BASE_URL=${publicBaseUrl}\nRUNTIME_SECRETS_DIR=../../private-secrets\nNGINX_CONFIG_FILE=../nginx/nginx.conf\n`);
  return { root, composeFile: "infra/docker/docker-compose.yml", envFile: ".env.production" };
}

test("preflight resolves the same secret and nginx paths as Compose", (t) => {
  const input = fixture(t);
  const config = loadDeploymentConfig(input, {});
  assert.equal(config.runtimeSecretsDir, path.join(input.root, "private-secrets"));
  assert.equal(config.nginxConfigFile, path.join(input.root, "infra/nginx/nginx.conf"));
  assert.equal(config.publicBaseUrl, "http://localhost:8080");
  assert.equal(loadDeploymentConfig(input, { RUNTIME_SECRETS_DIR: "/custom/secrets" }).runtimeSecretsDir, "/custom/secrets");
});

test("preflight rejects nonlocal plain HTTP and misleading public origins", (t) => {
  for (const url of ["http://ctf.example.edu", "https://user:pass@ctf.example.edu", "https://ctf.example.edu/path", "https://ctf.example.edu?key=value", "ftp://ctf.example.edu"]) {
    const input = fixture(t, url);
    assert.throws(() => loadDeploymentConfig(input, {}));
  }
  assert.equal(loadDeploymentConfig(fixture(t, "https://ctf.example.edu"), {}).publicBaseUrl, "https://ctf.example.edu");
});
