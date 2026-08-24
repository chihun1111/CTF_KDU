import assert from "node:assert/strict";
import test from "node:test";
import { PasswordHashService } from "./password-hash.service.js";

test("PasswordHashService stores a bcrypt-family one-way hash instead of plaintext", async () => {
  const service = new PasswordHashService();
  const hash = await service.hashPassword("valid-password");

  assert.match(hash, /^\$2[aby]\$/);
  assert.notEqual(hash, "valid-password");
  assert.equal(await service.verifyPassword("valid-password", hash), true);
  assert.equal(await service.verifyPassword("wrong-password", hash), false);
});

test("PasswordHashService uses a fresh salt for each password hash", async () => {
  const service = new PasswordHashService();

  assert.notEqual(await service.hashPassword("valid-password"), await service.hashPassword("valid-password"));
});
