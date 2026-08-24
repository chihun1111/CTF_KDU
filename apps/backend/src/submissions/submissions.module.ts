import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { CryptoService } from "../crypto/crypto.service.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { ClearCookieService } from "./clear-cookie.service.js";
import { ClearCertificateController } from "./clear-certificate.controller.js";
import { ClearCertificateDrizzleStore } from "./clear-certificate-drizzle.store.js";
import { ClearCertificateService, type ClearCertificateStore } from "./clear-certificate.service.js";
import { FinalSubmitController } from "./final-submit.controller.js";
import { FinalSubmitDrizzleStore } from "./final-submit-drizzle.store.js";
import { FinalSubmitService, type FinalSubmitStore } from "./final-submit.service.js";

export const FINAL_SUBMIT_STORE = Symbol("FINAL_SUBMIT_STORE");
export const CLEAR_CERTIFICATE_STORE = Symbol("CLEAR_CERTIFICATE_STORE");

@Module({
  imports: [AuthModule, AuditModule, CryptoModule, DatabaseModule],
  controllers: [FinalSubmitController, ClearCertificateController],
  providers: [
    ClearCookieService,
    {
      provide: FinalSubmitDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof FinalSubmitDrizzleStore>[0]) =>
        new FinalSubmitDrizzleStore(databaseClient),
    },
    {
      provide: FINAL_SUBMIT_STORE,
      useExisting: FinalSubmitDrizzleStore,
    },
    {
      provide: FinalSubmitService,
      inject: [FINAL_SUBMIT_STORE, CryptoService, ClearCookieService, AuditService],
      useFactory: (store: FinalSubmitStore, crypto: CryptoService, clearCookie: ClearCookieService, auditService: AuditService) =>
        new FinalSubmitService(store, crypto, clearCookie, auditService),
    },
    {
      provide: ClearCertificateDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof ClearCertificateDrizzleStore>[0]) =>
        new ClearCertificateDrizzleStore(databaseClient),
    },
    {
      provide: CLEAR_CERTIFICATE_STORE,
      useExisting: ClearCertificateDrizzleStore,
    },
    {
      provide: ClearCertificateService,
      inject: [CLEAR_CERTIFICATE_STORE, CryptoService, ClearCookieService],
      useFactory: (store: ClearCertificateStore, crypto: CryptoService, clearCookie: ClearCookieService) =>
        new ClearCertificateService(store, crypto, clearCookie),
    },
  ],
  exports: [FinalSubmitService, ClearCertificateService],
})
export class SubmissionsModule {}
