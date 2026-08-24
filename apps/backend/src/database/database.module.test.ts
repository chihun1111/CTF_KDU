import assert from "node:assert/strict";
import test from "node:test";
import { DATABASE_CLIENT, DATABASE_URL, DatabaseModule } from "./database.module.js";

const MODULE_PROVIDERS_METADATA = "providers";
const MODULE_EXPORTS_METADATA = "exports";

test("DatabaseModule provides and exports the database URL and client tokens", () => {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, DatabaseModule) as unknown[] | undefined;
  const exports = Reflect.getMetadata(MODULE_EXPORTS_METADATA, DatabaseModule) as unknown[] | undefined;

  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === DATABASE_URL));
  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === DATABASE_CLIENT));
  assert((exports ?? []).includes(DATABASE_URL));
  assert((exports ?? []).includes(DATABASE_CLIENT));
});
