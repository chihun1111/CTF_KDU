import assert from "node:assert/strict";
import test from "node:test";
import { readTokenCookie } from "./read-token-cookie.js";

test("token cookies accept one base64url value and reject malformed or ambiguous values", () => {
  assert.equal(readTokenCookie("other=x; ctf_session=token%2Dvalue_1", "ctf_session"), "token-value_1");
  for (const cookie of [
    "ctf_session=%",
    "ctf_session=%E0%A4%A",
    "ctf_session=%0Aevil",
    "ctf_session=one; ctf_session=two",
    "ctf_session=; ctf_session=valid",
    "ctf_session=" + "a".repeat(513),
    "other=" + "x".repeat(16_384),
  ]) {
    assert.equal(readTokenCookie(cookie, "ctf_session"), null);
  }
});
