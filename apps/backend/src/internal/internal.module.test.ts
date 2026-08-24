import assert from "node:assert/strict";
import test from "node:test";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { InternalFlagDrizzleStore } from "./internal-flag-drizzle.store.js";
import { InternalFlagService } from "./internal-flag.service.js";
import { InternalClaimDrizzleStore } from "./internal-claim-drizzle.store.js";
import { InternalClaimService } from "./internal-claim.service.js";
import { InternalController } from "./internal.controller.js";
import { INTERNAL_CLAIM_STORE, INTERNAL_FLAG_STORE, InternalModule } from "./internal.module.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

function providerTokens(moduleType: Function): unknown[] {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, moduleType) as unknown[] | undefined;
  return (providers ?? []).map((provider) =>
    typeof provider === "function" ? provider : (provider as { provide?: unknown }).provide,
  );
}

test("InternalModule wires internal controller with auth, crypto, and database providers", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, InternalModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, InternalModule) as unknown[] | undefined;
  const tokens = providerTokens(InternalModule);

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(AuditModule));
  assert((imports ?? []).includes(CryptoModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((controllers ?? []).includes(InternalController));
  assert(tokens.includes(InternalFlagDrizzleStore));
  assert(tokens.includes(InternalClaimDrizzleStore));
  assert(tokens.includes(INTERNAL_FLAG_STORE));
  assert(tokens.includes(INTERNAL_CLAIM_STORE));
  assert(tokens.includes(InternalFlagService));
  assert(tokens.includes(InternalClaimService));
});
