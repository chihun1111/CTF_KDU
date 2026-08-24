import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { SessionAuthService } from "../auth/session-auth.service.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { CryptoService } from "../crypto/crypto.service.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { InternalClaimDrizzleStore } from "./internal-claim-drizzle.store.js";
import { InternalClaimService, type InternalClaimStore } from "./internal-claim.service.js";
import { InternalFlagDrizzleStore } from "./internal-flag-drizzle.store.js";
import { InternalFlagService, type InternalFlagStore } from "./internal-flag.service.js";
import { InternalController } from "./internal.controller.js";

export const INTERNAL_FLAG_STORE = Symbol("INTERNAL_FLAG_STORE");
export const INTERNAL_CLAIM_STORE = Symbol("INTERNAL_CLAIM_STORE");

@Module({
  imports: [AuditModule, AuthModule, CryptoModule, DatabaseModule],
  controllers: [InternalController],
  providers: [
    {
      provide: InternalFlagDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof InternalFlagDrizzleStore>[0]) =>
        new InternalFlagDrizzleStore(databaseClient),
    },
    {
      provide: INTERNAL_FLAG_STORE,
      useExisting: InternalFlagDrizzleStore,
    },
    {
      provide: InternalClaimDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof InternalClaimDrizzleStore>[0]) =>
        new InternalClaimDrizzleStore(databaseClient),
    },
    {
      provide: INTERNAL_CLAIM_STORE,
      useExisting: InternalClaimDrizzleStore,
    },
    {
      provide: InternalFlagService,
      inject: [INTERNAL_FLAG_STORE, CryptoService, SessionAuthService],
      useFactory: (store: InternalFlagStore, crypto: CryptoService, sessionReader: SessionAuthService) =>
        new InternalFlagService(store, crypto, sessionReader),
    },
    {
      provide: InternalClaimService,
      inject: [INTERNAL_CLAIM_STORE, CryptoService, SessionAuthService, AuditService],
      useFactory: (
        store: InternalClaimStore,
        crypto: CryptoService,
        sessionReader: SessionAuthService,
        auditService: AuditService,
      ) => new InternalClaimService(store, crypto, sessionReader, undefined, auditService),
    },
  ],
  exports: [InternalFlagService, InternalClaimService],
})
export class InternalModule {}
