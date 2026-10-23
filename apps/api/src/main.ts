import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
  /* Body JSON tối đa 4 MB: đủ cho ảnh logo/bìa 2 MB gửi dạng base64; mặc định của Express chỉ 100 KB */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false, bodyParser: false });
  app.useBodyParser("json", { limit: "4mb" });
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
