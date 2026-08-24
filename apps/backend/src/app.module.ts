import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChallengesModule } from "./challenges/challenges.module.js";
import { ConfigModule } from "./config/config.module.js";
import { CryptoModule } from "./crypto/crypto.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { FlagsModule } from "./flags/flags.module.js";
import { HealthController } from "./health.controller.js";
import { HintsModule } from "./hints/hints.module.js";
import { InternalModule } from "./internal/internal.module.js";
import { PresenceModule } from "./presence/presence.module.js";
import { SubmissionsModule } from "./submissions/submissions.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CryptoModule,
    UsersModule,
    FlagsModule,
    HintsModule,
    AuthModule,
    PresenceModule,
    ChallengesModule,
    InternalModule,
    SubmissionsModule,
    AdminModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
