import assert from "node:assert/strict";
import test from "node:test";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { InMemoryPresenceStore } from "./in-memory-presence.store.js";
import { OnlineCountDrizzleStore } from "./online-count-drizzle.store.js";
import { OnlineCountService } from "./online-count.service.js";
import { PresenceController } from "./presence.controller.js";
import { PresenceHeartbeatService } from "./presence-heartbeat.service.js";
import { RedisPresenceStore } from "./redis-presence.store.js";
import { ONLINE_COUNT_FALLBACK_STORE, PresenceModule, PRESENCE_STORE, REDIS_CLIENT } from "./presence.module.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

function providerTokens(moduleType: Function): unknown[] {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, moduleType) as unknown[] | undefined;
  return (providers ?? []).map((provider) =>
    typeof provider === "function" ? provider : (provider as { provide?: unknown }).provide,
  );
}

test("PresenceModule wires heartbeat controller, auth guard import, and presence store provider", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, PresenceModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, PresenceModule) as unknown[] | undefined;
  const tokens = providerTokens(PresenceModule);

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((controllers ?? []).includes(PresenceController));
  assert(tokens.includes(PRESENCE_STORE));
  assert(tokens.includes(REDIS_CLIENT));
  assert(tokens.includes(ONLINE_COUNT_FALLBACK_STORE));
  assert(tokens.includes(PresenceHeartbeatService));
  assert(tokens.includes(OnlineCountService));
  assert(tokens.includes(InMemoryPresenceStore));
  assert(tokens.includes(RedisPresenceStore));
  assert(tokens.includes(OnlineCountDrizzleStore));
});
