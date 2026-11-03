import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { clearAdminCache } from "./admin/context.js";

export type CorrelatedRequest = Request & { correlationId?: string };

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction) {
    const incoming = request.header("x-correlation-id");
    const correlationId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    request.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    /* Đo tốc độ trên Render: một dòng log mỗi request (đường dẫn bỏ query — liên kết tải file có chữ ký); bỏ /health của cron giữ thức */
    const started = process.hrtime.bigint();
    /* Request ghi có thể đổi quyền/trạng thái tài khoản/doanh nghiệp: bỏ ngữ cảnh web đã nhớ (trước và sau khi xử lý) */
    const writes = request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
    if (writes) clearAdminCache();
    response.on("finish", () => {
      if (writes) clearAdminCache();
      const path = (request.originalUrl ?? request.url).split("?")[0] ?? "";
      if (path.endsWith("/health")) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`[req] ${request.method} ${path} ${response.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  }
}
