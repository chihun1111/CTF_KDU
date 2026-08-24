import assert from "node:assert/strict";
import test from "node:test";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ClearCookieService } from "./clear-cookie.service.js";
import { ClearCertificateController } from "./clear-certificate.controller.js";
import { ClearCertificateDrizzleStore } from "./clear-certificate-drizzle.store.js";
import { ClearCertificateService } from "./clear-certificate.service.js";
import { FinalSubmitController } from "./final-submit.controller.js";
import { FinalSubmitDrizzleStore } from "./final-submit-drizzle.store.js";
import { FinalSubmitService } from "./final-submit.service.js";
import { CLEAR_CERTIFICATE_STORE, FINAL_SUBMIT_STORE, SubmissionsModule } from "./submissions.module.js";

const MODULE_CONTROLLERS_METADATA = "controllers";
const MODULE_IMPORTS_METADATA = "imports";
const MODULE_PROVIDERS_METADATA = "providers";

function providerTokens(moduleType: Function): unknown[] {
  const providers = Reflect.getMetadata(MODULE_PROVIDERS_METADATA, moduleType) as unknown[] | undefined;
  return (providers ?? []).map((provider) =>
    typeof provider === "function" ? provider : (provider as { provide?: unknown }).provide,
  );
}

test("SubmissionsModule wires final submit controller with auth, crypto, and database providers", () => {
  const imports = Reflect.getMetadata(MODULE_IMPORTS_METADATA, SubmissionsModule) as unknown[] | undefined;
  const controllers = Reflect.getMetadata(MODULE_CONTROLLERS_METADATA, SubmissionsModule) as unknown[] | undefined;
  const tokens = providerTokens(SubmissionsModule);

  assert((imports ?? []).includes(AuthModule));
  assert((imports ?? []).includes(AuditModule));
  assert((imports ?? []).includes(CryptoModule));
  assert((imports ?? []).includes(DatabaseModule));
  assert((controllers ?? []).includes(FinalSubmitController));
  assert((controllers ?? []).includes(ClearCertificateController));
  assert(tokens.includes(FinalSubmitDrizzleStore));
  assert(tokens.includes(ClearCertificateDrizzleStore));
  assert(tokens.includes(FINAL_SUBMIT_STORE));
  assert(tokens.includes(CLEAR_CERTIFICATE_STORE));
  assert(tokens.includes(FinalSubmitService));
  assert(tokens.includes(ClearCertificateService));
  assert(tokens.includes(ClearCookieService));
});
