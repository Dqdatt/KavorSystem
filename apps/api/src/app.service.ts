import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  health() {
    return {
      service: "kavor-api" as const,
      status: "ok" as const,
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    };
  }

  productMeta() {
    return {
      name: "Kavor HRM",
      environment: process.env.NODE_ENV ?? "development",
      surfaces: ["admin-web", "console-web", "mobile-ios", "mobile-android"],
      database: "PostgreSQL/Supabase",
    };
  }

  sampleTenant() {
    return {
      id: "10000000-0000-4000-8000-000000000001",
      code: "HDG-001",
      name: "Hải Đăng Group",
      status: "active",
      plan: "growth",
      activeEmployees: 248,
      employeeLimit: 300,
      isBusinessRegistrationService: false,
    };
  }
}
