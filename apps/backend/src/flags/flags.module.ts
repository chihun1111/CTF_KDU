import { Module } from "@nestjs/common";
import { CryptoModule } from "../crypto/crypto.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { FlagIssuanceService } from "./flag-issuance.service.js";

@Module({
  imports: [CryptoModule, DatabaseModule],
  providers: [FlagIssuanceService],
  exports: [FlagIssuanceService],
})
export class FlagsModule {}
