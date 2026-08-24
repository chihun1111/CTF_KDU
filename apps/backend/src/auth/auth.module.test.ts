import assert from "node:assert/strict";
import test from "node:test";
import { AuthController } from "./auth.controller.js";
import { AuthModule, LOGIN_STORE, REGISTRATION_STORE, SESSION_AUTH_STORE } from "./auth.module.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { AuthLoginService } from "./auth-login.service.js";
import { AuthLogoutService } from "./auth-logout.service.js";
import { AuthRateLimiterService } from "./auth-rate-limiter.service.js";
import { AuthRegistrationService } from "./auth-registration.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionAuthService } from "./session-auth.service.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_PROVIDERS_METADATA = "providers";

function providerTokens(moduleType: Function): unknown[] {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, moduleType) as unknown[] | undefined;
  return (providers ?? []).map((provider) =>
    typeof provider === "function" ? provider : (provider as { provide?: unknown }).provide,
  );
}

test("AuthModule wires register controller, registration store, and registration service", () => {
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, AuthModule) as unknown[] | undefined;
  const tokens = providerTokens(AuthModule);

  assert((controllers ?? []).includes(AuthController));
  assert(tokens.includes(REGISTRATION_STORE));
  assert(tokens.includes(LOGIN_STORE));
  assert(tokens.includes(SESSION_AUTH_STORE));
  assert(tokens.includes(AuthRegistrationService));
  assert(tokens.includes(AuthLoginService));
  assert(tokens.includes(AuthLogoutService));
  assert(tokens.includes(AuthRateLimiterService));
  assert(tokens.includes(SessionAuthService));
  assert(tokens.includes(SessionAuthGuard));
  assert(tokens.includes(AdminRoleGuard));
});
