import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const verifierPath = path.resolve(import.meta.dirname, "verify-doc-links.mjs");

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "ctf-doc-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

function verify(root) {
  const result = spawnSync(process.execPath, [verifierPath], { cwd: root, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("public README and nested docs are checked without private Docs", (t) => {
  const root = fixture(t, {
    "README.md": '[운영](docs/operations.md "운영 안내")\n[설치](<docs/setup guide.md>)\n',
    "docs/operations.md": "[홈](../README.md#프로젝트)\n[설정](nested/config.md?raw=1)\n",
    "docs/setup guide.md": "[홈](/README.md)\n",
    "docs/nested/config.md": "[설치](../setup%20guide.md)\n",
  });
  const result = verify(root);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /4 Markdown files/);
});

test("broken README links fail even when there is no Docs directory", (t) => {
  const root = fixture(t, { "README.md": "[운영](docs/missing.md)\n" });
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /README\.md -> docs\/missing\.md/);
});

test("broken lowercase docs and reference links are reported", (t) => {
  const root = fixture(t, {
    "README.md": "[운영](docs/operations.md)\n",
    "docs/operations.md": "[상세][guide]\n\n[guide]: missing.md \"운영 절차\"\n",
  });
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /docs\/operations\.md -> missing\.md/);
});

test("optional private Docs are checked while historical archives remain excluded", (t) => {
  const root = fixture(t, {
    "README.md": "# CTF\n",
    "Docs/operations.md": "[없음](missing.md)\n",
    "Docs/archive/old.md": "[옛 문서](not-available.md)\n",
    "Docs/references/old.md": "[옛 참고](not-available.md)\n",
  });
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Docs\/operations\.md -> missing\.md/);
  assert.doesNotMatch(result.output, /not-available/);
});

test("code examples, fragments, and external URI schemes are not treated as local files", (t) => {
  const root = fixture(t, {
    "README.md": [
      "[웹](https://example.test/guide)",
      "[메일](mailto:ops@example.test)",
      "[전화](tel:+1234)",
      "[정적 자원](//example.test/asset)",
      "[본문](#details)",
      "`[예시](missing-inline.md)`",
      "```md",
      "[예시](missing-fenced.md)",
      "```",
      "~~~md",
      "[예시](missing-tilde.md)",
      "~~~",
    ].join("\n"),
  });
  const result = verify(root);
  assert.equal(result.status, 0, result.output);
});

test("invalid URL encoding and links escaping the repository fail", (t) => {
  const root = fixture(t, { "README.md": "[손상](docs/%XX.md)\n[외부](../../outside.md)\n" });
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /잘못된 URL 인코딩/);
  assert.match(result.output, /저장소 밖의 경로/);
});

test("missing README does not produce a misleading successful skip", (t) => {
  const root = fixture(t, {});
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Missing required documentation: README\.md/);
});
