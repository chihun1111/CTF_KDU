import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(import.meta.dirname, "verify-docker-image-pulls.mjs");

test("verify-docker-image-pulls prints the deployment image pull checklist", () => {
  const output = execFileSync(process.execPath, [scriptPath, "--print-images"], { encoding: "utf8" });
  const images = JSON.parse(output);

  assert.deepEqual(images, ["node:24-bookworm-slim", "nginx:1.27-alpine", "postgres:17-alpine", "redis:7.4-alpine"]);
});

test("verify-docker-image-pulls times out stalled pulls", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-docker-pull-"));
  const helper = path.join(dir, "sleep.mjs");
  writeFileSync(helper, "setTimeout(() => {}, 10000);\n");

  try {
    execFileSync(process.execPath, [scriptPath, "--image", "node:test", "--timeout-ms", "50"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DOCKER_PULL_COMMAND: `${process.execPath} ${helper}`,
      },
      stdio: "pipe",
    });
    assert.fail("expected stalled pull to fail");
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    assert.notEqual(error.status, 0);
    assert.match(output, /Timed out pulling node:test after 50ms/);
  }
});
