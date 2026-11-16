import assert from "node:assert/strict";
import { test } from "node:test";
import { loginFormSchema, passwordSchema, readSessionState, registerFormSchema, studentIdSchema } from "../app/lib/auth-validation";
import { validateSubmissionFlags } from "../app/lib/submission-validation";
import { FLAG_IDS, type FlagId } from "../app/lib/types";

function values(flag: string): Record<FlagId, string> {
  return Object.fromEntries(FLAG_IDS.map((id) => [id, id === "FLAG-01" ? flag : ""])) as Record<FlagId, string>;
}

const consent = { consentVersion: "test", requiredLoggingAccepted: true, analyticsLoggingAccepted: false, cookieAccepted: true };

test("login and registration accept unchanged ASCII alphanumeric passwords from 8 to 128 characters", () => {
  for (const password of ["AbCd1234", "OnlyLetters", "12345678", "A".repeat(128), "0".repeat(128)]) {
    const input = { studentId: "2622022", password, consent };
    assert.equal(passwordSchema.parse(password), password);
    assert.equal(loginFormSchema.parse(input).password, password);
    assert.equal(registerFormSchema.parse(input).password, password);
  }
  for (const password of ["", "A".repeat(7), "A".repeat(129)]) {
    assert.equal(passwordSchema.safeParse(password).success, false);
  }
});

test("passwords reject symbols, spaces, every ASCII control, Unicode and nonstring values", () => {
  const forbidden: unknown[] = [null, undefined, 12345678, [], {},
    " Valid123", "Valid123 ", "Valid123\r\n", "Valid123😀", "Valid123\u2764\uFE0F",
    "Valid123\u2764\uFE0E", "Valid123한글", "ＡＢＣＤＥＦ１２", "Valid123é", "Valid123\u00a0",
    "Valid123\u200b", "\uFFFD".repeat(8), "\uD800".repeat(8), "\uDC00".repeat(8)];
  for (let code = 0; code <= 127; code += 1) {
    const character = String.fromCharCode(code);
    if (!/[A-Za-z0-9]/.test(character)) forbidden.push(`Valid123${character}`);
  }
  for (const password of forbidden) {
    assert.equal(passwordSchema.safeParse(password).success, false, "disallowed password must be rejected without sanitizing");
    assert.equal(loginFormSchema.safeParse({ studentId: "2622022", password }).success, false);
    assert.equal(registerFormSchema.safeParse({ studentId: "2622022", password, consent }).success, false);
  }
});

test("student IDs are exactly seven digits with no trailing line break or coercion", () => {
  for (const studentId of ["0000000", "2622022"]) assert.equal(studentIdSchema.parse(studentId), studentId);
  for (const studentId of ["2622022\n", "2622022\r", "2622022\r\n", "2622022 ", " 2622022", "262202", "26220222", "２６２２０２２", 2622022, null]) {
    assert.equal(studentIdSchema.safeParse(studentId).success, false);
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
