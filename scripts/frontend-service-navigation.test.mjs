import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const legacyServiceHrefPattern = /href\s*=\s*(?:["']|\{\s*["'`])\/services\//;

test("participant service cards link directly to the serviceHref returned by the API", () => {
  const card = read("apps/frontend/app/components/services/service-directory-card.tsx");

  assert.match(card, /href=\{service\.serviceHref\}/);
  assert.doesNotMatch(card, /guideHref|guideUrl/);
  assert.doesNotMatch(card, legacyServiceHrefPattern);
});

test("the participant hub flow does not link through the service guide route", () => {
  for (const relativePath of [
    "apps/frontend/app/hub/page.tsx",
    "apps/frontend/app/components/services/service-directory-grid.tsx",
    "apps/frontend/app/components/services/service-directory-card.tsx",
  ]) {
    assert.doesNotMatch(read(relativePath), legacyServiceHrefPattern, relativePath);
  }
});
