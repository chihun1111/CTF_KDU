import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDatabaseUrl } from "./database-url.js";

test("buildDatabaseUrl returns DATABASE_URL when explicitly provided", () => {
  assert.equal(
    buildDatabaseUrl({
      DATABASE_URL: "postgres://user:pass@db.example/campus",
      DATABASE_HOST: "ignored",
    }),
    "postgres://user:pass@db.example/campus",
  );
});

test("buildDatabaseUrl reads DATABASE_PASSWORD_FILE and URL-encodes credentials", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "campus-ctf-db-"));
  const passwordPath = path.join(dir, "postgres-password");
  writeFileSync(passwordPath, "p@ss word\n", "utf8");

  assert.equal(
    buildDatabaseUrl({
      DATABASE_HOST: "postgres",
      DATABASE_PORT: "5432",
      DATABASE_NAME: "campus_ctf",
      DATABASE_USER: "campus user",
      DATABASE_PASSWORD_FILE: passwordPath,
    }),
    "postgres://campus%20user:p%40ss%20word@postgres:5432/campus_ctf",
  );
});

test("buildDatabaseUrl rejects missing password material", () => {
  assert.throws(
    () =>
      buildDatabaseUrl({
        DATABASE_HOST: "postgres",
        DATABASE_NAME: "campus_ctf",
        DATABASE_USER: "campus_ctf",
      }),
    /DATABASE_PASSWORD or DATABASE_PASSWORD_FILE is required/,
  );
});
