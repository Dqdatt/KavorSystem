import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ConfigError, loadConfig } from "./config.js";

async function bootstrap() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const app = await NestFactory.create(AppModule, { cors: false });
  const port = config.port;

  app.setGlobalPrefix("api/v1");
  /* IP thật của client cho giới hạn số lần thử (API đứng sau proxy ở staging) */
  app.getHttpAdapter().getInstance().set("trust proxy", config.env !== "development");
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Kavor API (${config.env}) listening on http://localhost:${port}/api/v1 · Supabase ${config.supabase ? "đã cấu hình" : "chưa cấu hình (dữ liệu mẫu)"}`);
}

void bootstrap();
