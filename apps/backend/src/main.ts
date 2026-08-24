import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // External traffic reaches the backend through exactly one Nginx hop.
  // Nginx overwrites X-Forwarded-For, so request.ip is the actual client IP.
  app.set("trust proxy", 1);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, "0.0.0.0");
}

await bootstrap();
