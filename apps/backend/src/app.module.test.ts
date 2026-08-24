import assert from "node:assert/strict";
import test from "node:test";
import { AppModule } from "./app.module.js";

const MODULE_IMPORTS_METADATA = "imports";

test("AppModule imports documented backend module boundaries", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, AppModule) as Function[] | undefined;
  const importNames = (imports ?? []).map((moduleType) => moduleType.name).sort();

  assert.deepEqual(importNames, [
    "AdminModule",
    "AuditModule",
    "AuthModule",
    "ChallengesModule",
    "ConfigModule",
    "CryptoModule",
    "DatabaseModule",
    "FlagsModule",
    "HintsModule",
    "InternalModule",
    "PresenceModule",
    "SubmissionsModule",
    "UsersModule",
  ]);
});
