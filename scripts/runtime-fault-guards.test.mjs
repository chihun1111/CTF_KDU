import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

for (const script of ["runtime-database-smoke.mjs", "runtime-resilience-smoke.mjs"]) {
  test(`${script} refuses to operate on a non-CI or non-disposable deployment`, () => {
    for (const [ci, project] of [["false", "ctf-ci-123"], ["true", "campus-ctf-2026"], ["true", ""]]) {
      const result = spawnSync(process.execPath, [path.join(import.meta.dirname, script)], {
        encoding: "utf8", env: { ...process.env, CI: ci, COMPOSE_PROJECT_NAME: project }, timeout: 5_000,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /require a disposable ctf-ci-\*/);
    }
  });
}
