import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { ApiEnvelope } from "@kavor/contracts";
import { AppService } from "./app.service.js";
import type { CorrelatedRequest } from "./correlation.middleware.js";

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  private envelope<T>(request: CorrelatedRequest, data: T): ApiEnvelope<T> {
    return {
      data,
      meta: { correlationId: request.correlationId ?? "unknown" },
      error: null,
    };
  }

  @Get("health")
  health(@Req() request: CorrelatedRequest) {
    return this.envelope(request, this.appService.health());
  }

  @Get("meta")
  meta(@Req() request: CorrelatedRequest) {
    return this.envelope(request, this.appService.productMeta());
  }

  @Get("tenants/sample")
  sampleTenant(@Req() request: CorrelatedRequest) {
    return this.envelope(request, this.appService.sampleTenant());
  }
}
