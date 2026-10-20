export const PRODUCT_SURFACES = [
  "admin-web",
  "console-web",
  "mobile-ios",
  "mobile-android",
] as const;

export type ProductSurface = (typeof PRODUCT_SURFACES)[number];

export type TenantStatus = "provisioning" | "active" | "suspended" | "closed";

export type ApiError = {
  code: string;
  message: string;
  fields?: Array<{ field: string; code: string }>;
  retryable: boolean;
};

export type ApiEnvelope<T> = {
  data: T | null;
  meta: { correlationId: string };
  error: ApiError | null;
};

export type HealthResponse = {
  service: "kavor-api";
  status: "ok";
  timestamp: string;
  version: string;
};

export type TenantSummary = {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  plan: "trial" | "starter" | "growth" | "enterprise";
  activeEmployees: number;
  employeeLimit: number;
};

export const SAMPLE_TENANT: TenantSummary = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "HDG-001",
  name: "Hải Đăng Group",
  status: "active",
  plan: "growth",
  activeEmployees: 248,
  employeeLimit: 300,
};
