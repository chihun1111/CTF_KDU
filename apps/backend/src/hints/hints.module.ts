import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { HintReleaseDrizzleStore } from "./hints-drizzle.store.js";
import { HintsController } from "./hints.controller.js";
import { HintsService, type HintReleaseStore } from "./hints.service.js";

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  controllers: [HintsController],
  providers: [
    {
      provide: HintReleaseDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (database: ConstructorParameters<typeof HintReleaseDrizzleStore>[0]) => new HintReleaseDrizzleStore(database),
    },
    {
      provide: HintsService,
      inject: [HintReleaseDrizzleStore, AuditService],
      useFactory: (store: HintReleaseStore, auditService: AuditService) => new HintsService(store, auditService),
    },
  ],
})
export class HintsModule {}
