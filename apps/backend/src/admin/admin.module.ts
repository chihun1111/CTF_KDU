import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { PresenceModule } from "../presence/presence.module.js";
import { OnlineCountService } from "../presence/online-count.service.js";
import { AdminOperationsDrizzleStore } from "./admin-operations-drizzle.store.js";
import { AdminOperationsController } from "./admin-operations.controller.js";
import { AdminOperationsService, type AdminOperationsStore } from "./admin-operations.service.js";
import { AdminReadController } from "./admin-read.controller.js";

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule, PresenceModule],
  controllers: [AdminOperationsController, AdminReadController],
  providers: [
    {
      provide: AdminOperationsDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (database: ConstructorParameters<typeof AdminOperationsDrizzleStore>[0]) =>
        new AdminOperationsDrizzleStore(database),
    },
    {
      provide: AdminOperationsService,
      inject: [AdminOperationsDrizzleStore, OnlineCountService],
      useFactory: (store: AdminOperationsStore, onlineCountService: OnlineCountService) =>
        new AdminOperationsService(store, onlineCountService),
    },
  ],
})
export class AdminModule {}
