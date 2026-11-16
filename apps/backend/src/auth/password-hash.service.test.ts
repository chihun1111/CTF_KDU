import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { PasswordHashService } from "./password-hash.service.js";

test("PasswordHashService stores a versioned bcrypt-SHA256 hash instead of plaintext", async () => {
  const service = new PasswordHashService();
  const hash = await service.hashPassword("valid-password");

  assert.match(hash, /^ctf-bcrypt-sha256-v1\$\$2[aby]\$/);
  assert.notEqual(hash, "valid-password");
  assert.equal(await service.verifyPassword("valid-password", hash), true);
  assert.equal(await service.verifyPassword("wrong-password", hash), false);
});

test("PasswordHashService distinguishes long UTF-8 passwords after bcrypt's 72-byte boundary", async () => {
  const service = new PasswordHashService();
  const prefix = "한".repeat(30);
  const hash = await service.hashPassword(prefix + "A");
  assert.equal(await service.verifyPassword(prefix + "A", hash), true);
  assert.equal(await service.verifyPassword(prefix + "B", hash), false);
});

test("PasswordHashService remains compatible with existing unversioned bcrypt records", async () => {
  const service = new PasswordHashService();
  const legacy = await bcrypt.hash("legacy-password", 4);
  assert.equal(await service.verifyPassword("legacy-password", legacy), true);
  assert.equal(await service.verifyPassword("wrong-password", legacy), false);
  assert.equal(await service.verifyPassword("legacy-password", "unsupported-hash"), false);
});

test("PasswordHashService uses a fresh salt for each password hash", async () => {
  const service = new PasswordHashService();

  assert.notEqual(await service.hashPassword("valid-password"), await service.hashPassword("valid-password"));
});
