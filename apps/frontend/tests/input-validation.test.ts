import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordSchema, readSessionState } from "../app/lib/auth-validation";
import { validateSubmissionFlags } from "../app/lib/submission-validation";
import { FLAG_IDS, type FlagId } from "../app/lib/types";

function values(flag: string): Record<FlagId, string> {
  return Object.fromEntries(FLAG_IDS.map((id) => [id, id === "FLAG-01" ? flag : ""])) as Record<FlagId, string>;
}

test("frontend password limits count surrogate pairs like the backend", () => {
  assert.equal(passwordSchema.safeParse("😀".repeat(4)).success, false);
  assert.equal(passwordSchema.safeParse("😀".repeat(7)).success, false);
  assert.equal(passwordSchema.safeParse("😀".repeat(8)).success, true);
  assert.equal(passwordSchema.safeParse("😀".repeat(128)).success, true);
  assert.equal(passwordSchema.safeParse("😀".repeat(129)).success, false);
  assert.equal(passwordSchema.safeParse("a".repeat(128)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(129)).success, false);
});

test("frontend password bounds preserve the backend's presentation-selector contract", () => {
  const cases = [
    { label: "emoji presentation", unit: "\u2764\uFE0F", accepted: [8, 128], rejected: [4, 7, 129] },
    { label: "text presentation", unit: "\u2764\uFE0E", accepted: [8, 128], rejected: [7, 129] },
    { label: "supplementary emoji presentation", unit: "😀\uFE0F", accepted: [8, 128], rejected: [7, 129] },
    { label: "consecutive selectors", unit: "a\uFE0F\uFE0E", accepted: [4, 64], rejected: [3, 65] },
    { label: "standalone selectors", unit: "\uFE0F", accepted: [8, 128], rejected: [7, 129] },
    { label: "other BMP variation selector", unit: "a\uFE00", accepted: [4, 64], rejected: [3, 65] },
    { label: "supplementary variation selector", unit: "a\u{E0100}", accepted: [4, 64], rejected: [3, 65] },
    { label: "zero-width joiner sequence", unit: "👩‍💻", accepted: [3, 42], rejected: [2, 43] },
  ];
  for (const { label, unit, accepted, rejected } of cases) {
    for (const count of accepted) {
      assert.equal(passwordSchema.safeParse(unit.repeat(count)).success, true, `${label} × ${count}`);
    }
    for (const count of rejected) {
      assert.equal(passwordSchema.safeParse(unit.repeat(count)).success, false, `${label} × ${count}`);
    }
  }
});

test("flag validation accepts the backend's boundary and rejects previously accepted overlong payloads", () => {
  const flag = (content: string) => "KDUCTF" + `{${content}}`;
  assert.deepEqual(validateSubmissionFlags(values(flag("a".repeat(200)))), {});
  assert.deepEqual(validateSubmissionFlags(values(` \t${flag("valid")}\n `)), {});
  for (const content of ["a".repeat(201), "a".repeat(220), "", "one\ntwo", "nested{value}"]) {
    assert.ok(validateSubmissionFlags(values(flag(content)))["FLAG-01"], `invalid payload length ${content.length}`);
  }
  assert.ok(validateSubmissionFlags(values("   "))["FLAG-01"]);
});

test("malformed successful session payloads cannot trigger role redirects", () => {
  assert.deepEqual(readSessionState({ authenticated: false }), { authenticated: false });
  assert.deepEqual(readSessionState({ authenticated: true, role: "participant" }), { authenticated: true, role: "participant" });
  for (const body of [null, {}, { authenticated: "false", role: "admin" }, { authenticated: true }, { authenticated: true, role: "owner" }]) {
    assert.throws(() => readSessionState(body), /인증 서비스/);
  }
});
