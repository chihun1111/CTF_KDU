import assert from "node:assert/strict";
import test from "node:test";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { AdminOperationsDrizzleStore } from "./admin-operations-drizzle.store.js";
import { AdminOperationsController } from "./admin-operations.controller.js";
import { AdminOperationsService } from "./admin-operations.service.js";
import { AdminReadController } from "./admin-read.controller.js";
import { AdminModule } from "./admin.module.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

test("AdminModule wires operations controller, store, and service behind auth/database/presence modules", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, AdminModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, AdminModule) as unknown[] | undefined;
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, AdminModule) as unknown[] | undefined;

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(AuditModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((imports ?? []).includes(PresenceModule));
  assert((controllers ?? []).includes(AdminOperationsController));
  assert((controllers ?? []).includes(AdminReadController));
  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === AdminOperationsDrizzleStore));
  assert((providers ?? []).some((provider) => typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === AdminOperationsService));
});
