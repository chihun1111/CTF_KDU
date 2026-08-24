import assert from "node:assert/strict";
import test from "node:test";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ChallengesController } from "./challenges.controller.js";
import { ChallengesDrizzleStore } from "./challenges-drizzle.store.js";
import { CHALLENGES_STORE, ChallengesModule } from "./challenges.module.js";
import { ChallengesService } from "./challenges.service.js";
import { ProgressController } from "./progress.controller.js";
import { ChallengeArtifactController } from "./challenge-artifact.controller.js";
import { ChallengeArtifactService } from "./challenge-artifact.service.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

function providerTokens(moduleType: Function): unknown[] {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, moduleType) as unknown[] | undefined;
  return (providers ?? []).map((provider) =>
    typeof provider === "function" ? provider : (provider as { provide?: unknown }).provide,
  );
}

test("ChallengesModule wires challenge controller behind auth and database stores", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, ChallengesModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, ChallengesModule) as unknown[] | undefined;
  const tokens = providerTokens(ChallengesModule);

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((controllers ?? []).includes(ChallengesController));
  assert((controllers ?? []).includes(ProgressController));
  assert.equal((controllers ?? []).includes(ChallengeArtifactController), false);
  assert(tokens.includes(ChallengesDrizzleStore));
  assert(tokens.includes(CHALLENGES_STORE));
  assert(tokens.includes(ChallengesService));
  assert.equal(tokens.includes(ChallengeArtifactService), false);
});
