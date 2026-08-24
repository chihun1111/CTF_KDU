import { Module } from "@nestjs/common";
import { CryptoModule } from "../crypto/crypto.module.js";
import { DatabaseModule } from "../database/database.module.js";

@Module({
  imports: [CryptoModule, DatabaseModule],
  exports: [],
})
export class UsersModule {}
