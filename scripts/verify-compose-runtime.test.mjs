import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

function writeFixture(root, fileName, data) {
  const fullPath = path.join(root, fileName);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
  return fullPath;
}

function runVerifier(root, psRows) {
  const configPath = writeFixture(
    root,
    "compose-config.json",
    JSON.stringify({
      services: {
        backend: {},
        nginx: {},
        redis: {},
      },
    }),
  );
  const psPath = writeFixture(root, "compose-ps.json", psRows.map((row) => JSON.stringify(row)).join("\n"));
  return execFileSync(process.execPath, [
    "scripts/verify-compose-runtime.mjs",
    "--config-json",
    configPath,
    "--ps-json",
    psPath,
  ], {
    encoding: "utf8",
  });
}

test("verify-compose-runtime accepts running services and healthy checked services", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-compose-runtime-"));
  const output = runVerifier(root, [
    { Service: "backend", State: "running", Health: "healthy" },
    { Service: "nginx", State: "running" },
    { Service: "redis", State: "running", Health: "healthy" },
  ]);

  assert.match(output, /Compose runtime verification passed/);
});

test("verify-compose-runtime rejects missing, stopped, and unhealthy services", () => {
  const root = mkdtempSync(path.join(tmpdir(), "campus-ctf-compose-runtime-"));

  assert.throws(
    () => runVerifier(root, [
      { Service: "backend", State: "running", Health: "starting" },
      { Service: "redis", State: "exited", Health: "" },
    ]),
    (error) => {
      assert.match(error.stderr, /Missing running compose container: nginx/);
      assert.match(error.stderr, /backend health is starting instead of healthy/);
      assert.match(error.stderr, /redis is exited instead of running/);
      return true;
    },
  );
});
