import { Module } from "@nestjs/common";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { AuditDrizzleStore } from "./audit-drizzle.store.js";
import { AuditService, type AuditStore } from "./audit.service.js";

export const AUDIT_STORE = Symbol("AUDIT_STORE");

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: AuditDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (database: ConstructorParameters<typeof AuditDrizzleStore>[0]) => new AuditDrizzleStore(database),
    },
    {
      provide: AUDIT_STORE,
      useExisting: AuditDrizzleStore,
    },
    {
      provide: AuditService,
      inject: [AUDIT_STORE],
      useFactory: (store: AuditStore) => new AuditService(store),
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
