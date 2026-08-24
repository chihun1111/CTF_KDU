import assert from "node:assert/strict";
import test from "node:test";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { HintsController } from "./hints.controller.js";
import { HintReleaseDrizzleStore } from "./hints-drizzle.store.js";
import { HintsService } from "./hints.service.js";
import { HintsModule } from "./hints.module.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

test("HintsModule wires hint controller, release store, and service behind auth/database/audit modules", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, HintsModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, HintsModule) as unknown[] | undefined;
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, HintsModule) as unknown[] | undefined;

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(AuditModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((controllers ?? []).includes(HintsController));
  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === HintReleaseDrizzleStore));
  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === HintsService));
});
