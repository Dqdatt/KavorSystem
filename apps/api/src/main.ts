import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const port = Number(process.env.API_PORT ?? 4000);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Kavor API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
