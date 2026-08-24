import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { CryptoService } from "./crypto.service.js";

@Module({
  imports: [ConfigModule],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
