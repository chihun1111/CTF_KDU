import assert from "node:assert/strict";
import test from "node:test";
import { ClearCookieService } from "./clear-cookie.service.js";

test("ClearCookieService builds a hardened one-time clear cookie", () => {
  const service = new ClearCookieService();

  assert.equal(
    service.buildClearCookie("clear-token", 300),
    "ctf_clear_once=clear-token; HttpOnly; Secure; SameSite=Strict; Path=/clear; Max-Age=300",
  );
  assert.equal(service.buildClearCookie("clear-token", 300).includes("user"), false);
});

test("ClearCookieService expires the one-time clear cookie", () => {
  const service = new ClearCookieService();

  assert.equal(
    service.buildExpiredClearCookie(),
    "ctf_clear_once=; HttpOnly; Secure; SameSite=Strict; Path=/clear; Max-Age=0",
  );
});
