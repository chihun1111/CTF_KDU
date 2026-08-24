import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("deployment-preflight exposes documented deployment checks", () => {
  const source = execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync('scripts/deployment-preflight.mjs','utf8'))"], {
    encoding: "utf8",
  });

  assert.match(source, /verify:workspace/);
  assert.match(source, /verify:secrets/);
  assert.match(source, /verify:sensitive/);
  assert.match(source, /docker/);
  assert.match(source, /compose/);
  assert.match(source, /verify:compose/);
  assert.match(source, /verify:compose-runtime/);
  assert.match(source, /verify:images/);
  assert.match(source, /--image-timeout-ms/);
  assert.match(source, /--skip-image-pulls/);
  assert.match(source, /ps/);
  assert.match(source, /--backend-log/);
  assert.match(source, /--db-dump/);
});
