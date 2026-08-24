import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { ChallengesController } from "./challenges.controller.js";
import { ChallengesDrizzleStore } from "./challenges-drizzle.store.js";
import { ChallengesService, type ChallengesStore } from "./challenges.service.js";
import { ProgressController } from "./progress.controller.js";

export const CHALLENGES_STORE = Symbol("CHALLENGES_STORE");
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ChallengesController, ProgressController],
  providers: [
    {
      provide: ChallengesDrizzleStore,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof ChallengesDrizzleStore>[0]) =>
        new ChallengesDrizzleStore(databaseClient),
    },
    {
      provide: CHALLENGES_STORE,
      useExisting: ChallengesDrizzleStore,
    },
    {
      provide: ChallengesService,
      inject: [CHALLENGES_STORE],
      useFactory: (store: ChallengesStore) => new ChallengesService(store),
    },
  ],
  exports: [ChallengesService],
})
export class ChallengesModule {}
