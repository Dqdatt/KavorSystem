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

/* ---------- Auth (mobile/web ↔ API) ---------- */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  /* epoch giây */
  expiresAt: number;
};

export type MeProfile = {
  userId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  tenant: { id: string; code: string; name: string };
};

export type AuthResult = { session: AuthSession; me: MeProfile };

export type ActivationStartRequest = { employeeCode: string; email: string };
export type ActivationVerifyRequest = { email: string; code: string; password: string };
export type LoginRequest = { identifier: string; password: string };
export type PasswordForgotRequest = { identifier: string };
export type PasswordResetRequest = { email: string; code: string; newPassword: string };
export type RefreshRequest = { refreshToken: string };
/* destination: email đã che bớt để hiển thị ("th***@haidang.vn") */
export type OtpSentResponse = { sent: true; email: string | null; destination: string | null; expiresInSeconds: number };

/* Mã lỗi auth ổn định để client hiển thị thông điệp phù hợp */
export const AUTH_ERRORS = {
  invalidCredentials: "AUTH_INVALID_CREDENTIALS",
  employeeNotFound: "AUTH_EMPLOYEE_NOT_FOUND",
  alreadyActivated: "AUTH_ALREADY_ACTIVATED",
  notActivated: "AUTH_NOT_ACTIVATED",
  otpInvalid: "AUTH_OTP_INVALID",
  weakPassword: "AUTH_WEAK_PASSWORD",
  accountDisabled: "AUTH_ACCOUNT_DISABLED",
  rateLimited: "AUTH_RATE_LIMITED",
  sessionExpired: "AUTH_SESSION_EXPIRED",
} as const;

/* Chính sách mật khẩu dùng chung cho client (báo lỗi sớm) và server (kiểm tra bắt buộc) */
export function passwordProblems(password: string, employeeCode?: string): string[] {
  const p: string[] = [];
  if (password.length < 8) p.push("Mật khẩu cần có ít nhất 8 ký tự.");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) p.push("Mật khẩu cần có cả chữ và số.");
  if (!/[A-Z]/.test(password)) p.push("Mật khẩu cần có ít nhất một chữ hoa.");
  if (employeeCode && password.toLowerCase().includes(employeeCode.toLowerCase())) p.push("Mật khẩu không được chứa mã nhân viên.");
  return p;
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

/* ---------- Chấm công ---------- */
export type DevicePlatform = "ios" | "android";
export type DeviceRegisterRequest = { installationId: string; platform: DevicePlatform; deviceModel?: string; osVersion?: string; appVersion?: string };
export type DeviceStatus = "active" | "pending" | "revoked" | "rejected";
/* decisionReason: lý do HR từ chối/thu hồi (hiển thị cho nhân viên) */
export type DeviceInfo = { id: string; status: DeviceStatus; platform: DevicePlatform; deviceModel: string | null; osVersion: string | null; registeredAt: string; decisionReason: string | null };

export type WorkLocation = { id: string; name: string; address: string | null; latitude: number; longitude: number; radiusM: number; maxAccuracyM: number };

export type AttendanceKind = "in" | "out";
export type AttendanceRejectReason = "out_of_range" | "low_accuracy" | "device_not_registered" | "invalid_sequence" | "clock_skew";
export type AttendanceEventRequest = {
  /* Khóa chống trùng do app sinh; gửi lại cùng khóa trả về bản ghi cũ */
  clientEventId: string;
  kind: AttendanceKind;
  installationId: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  /* Chỉ dùng khi gửi từ hàng đợi offline; online thì máy chủ lấy giờ của máy chủ */
  occurredAt?: string;
  offline?: boolean;
};
export type AttendanceEvent = {
  id: string;
  recordCode: string;
  kind: AttendanceKind;
  occurredAt: string;
  receivedAt: string;
  status: "accepted" | "rejected";
  rejectReason: AttendanceRejectReason | null;
  distanceM: number | null;
  accuracyM: number | null;
  locationName: string | null;
  offline: boolean;
  /* Phút đi muộn (vào) hoặc về sớm (ra) so với ca; 0 nếu đúng giờ */
  deviationMinutes: number;
};
/* Ca áp dụng cho nhân viên vào một ngày, đã tra theo tầng (ADR 0001); giờ dạng "HH:MM" theo múi giờ công ty */
export type ShiftInfo = {
  id: string;
  code: string;
  name: string;
  versionNo: number;
  start: string;
  end: string;
  breakStart: string | null;
  breakEnd: string | null;
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
};
export type AttendanceToday = {
  date: string;
  timezone: string;
  /* null: nhân viên chưa được áp dụng ca nào */
  shift: ShiftInfo | null;
  locations: WorkLocation[];
  device: DeviceInfo | null;
  events: AttendanceEvent[];
  clockIn: AttendanceEvent | null;
  clockOut: AttendanceEvent | null;
};

export const ATTENDANCE_ERRORS = {
  deviceNotRegistered: "ATT_DEVICE_NOT_REGISTERED",
  devicePending: "ATT_DEVICE_PENDING",
  invalidSequence: "ATT_INVALID_SEQUENCE",
  clockSkew: "ATT_CLOCK_SKEW",
  noLocation: "ATT_NO_LOCATION",
} as const;

/* Khoảng cách hai tọa độ (mét), công thức haversine */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------- HR/Admin (web) ---------- */
/* Một file duy nhất: mobile (Metro) và web (Next) import thẳng mã nguồn TS nên không dùng đường dẫn ".js" */
export type ScopeType = "tenant" | "legal_entity" | "branch" | "department" | "self" | "direct_reports";
export type PolicyScopeType = "tenant" | "legal_entity" | "branch" | "department" | "employee";
export type Ref = { id: string; name: string };

export type AdminRole = { code: string; name: string; scopeType: ScopeType; scopeName: string };
export type AdminMe = {
  userId: string;
  employeeId: string | null;
  fullName: string;
  email: string;
  tenant: { id: string; code: string; name: string; timezone: string };
  roles: AdminRole[];
  permissions: string[];
  /* Cảnh báo thường trực khi tenant chỉ còn một Tenant Admin (ADR 0001) */
  tenantAdminCount: number;
};

/* not_invited: chưa gửi lời mời · invited: đã mời, chưa kích hoạt · active · locked: HR đã khóa đăng nhập */
export type AccountStatus = "not_invited" | "invited" | "active" | "locked";
export type EmploymentType = "probation" | "official" | "contractor" | "intern";
export type EmployeeStatus = "preboarding" | "active" | "suspended" | "on_leave" | "leaving" | "terminated";

export type EmployeeListItem = {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hireDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department: Ref | null;
  position: Ref | null;
  branch: Ref | null;
  account: AccountStatus;
  invitedAt: string | null;
  lastLoginAt: string | null;
  devicePending: boolean;
};

export type PolicySource = { scopeType: PolicyScopeType; scopeName: string; assignmentId: string };
export type ResolvedPolicies = {
  date: string;
  shift: (ShiftInfo & { source: PolicySource }) | null;
  locations: WorkLocation[];
  locationSource: PolicySource | null;
};

export type AdminDevice = {
  id: string;
  employee: { id: string; code: string; fullName: string };
  platform: DevicePlatform;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  status: DeviceStatus;
  registeredAt: string;
  lastSeenAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
};

export type AdminAttendanceEvent = AttendanceEvent & { employee: { id: string; code: string; fullName: string; department: string | null }; deviceModel: string | null };

export type AuditEntry = { id: string; action: string; actor: string | null; createdAt: string; reason: string | null; before: unknown; after: unknown };

export type EmployeeDetail = EmployeeListItem & {
  legalEntity: Ref | null;
  manager: Ref | null;
  assignmentFrom: string | null;
  terminationDate: string | null;
  devices: AdminDevice[];
  policies: ResolvedPolicies;
  recentEvents: AdminAttendanceEvent[];
  audit: AuditEntry[];
};

export type EmployeeUpsert = {
  employeeCode: string;
  fullName: string;
  workEmail: string;
  phone?: string | null;
  hireDate: string;
  employmentType: EmploymentType;
  status?: EmployeeStatus;
  departmentId: string;
  positionId: string;
  managerEmployeeId?: string | null;
  /* Ngày hiệu lực khi đổi phòng ban/chức danh/quản lý; mặc định hôm nay */
  effectiveFrom?: string;
  sendInvite?: boolean;
};

export type ShiftVersion = {
  id: string; versionNo: number; start: string; end: string; breakStart: string | null; breakEnd: string | null;
  lateGraceMinutes: number; earlyGraceMinutes: number; effectiveFrom: string; note: string | null; createdAt: string;
};
export type ShiftDef = { id: string; code: string; name: string; active: boolean; current: ShiftVersion | null; next: ShiftVersion | null; versions: ShiftVersion[] };
export type ShiftVersionInput = { start: string; end: string; breakStart?: string | null; breakEnd?: string | null; lateGraceMinutes?: number; earlyGraceMinutes?: number; effectiveFrom: string; note?: string | null };

export type LocationVersion = { id: string; versionNo: number; latitude: number; longitude: number; radiusM: number; maxAccuracyM: number; effectiveFrom: string; note: string | null; createdAt: string };
export type LocationDef = { id: string; code: string; name: string; address: string | null; branch: Ref | null; active: boolean; current: LocationVersion | null; next: LocationVersion | null; versions: LocationVersion[] };
export type LocationVersionInput = { latitude: number; longitude: number; radiusM: number; maxAccuracyM: number; effectiveFrom: string; note?: string | null };

export type PolicyKind = "shift" | "work_location";
export type PolicyAssignment = {
  id: string; kind: PolicyKind; target: Ref; scopeType: PolicyScopeType; scope: Ref | null;
  effectiveFrom: string; effectiveTo: string | null; reason: string | null; createdAt: string; createdBy: string | null;
  state: "active" | "scheduled" | "ended" | "cancelled";
};
export type PolicyAssignmentInput = { kind: PolicyKind; targetId: string; scopeType: PolicyScopeType; scopeId?: string | null; effectiveFrom: string; effectiveTo?: string | null; reason?: string | null };

export type OrgOptions = { legalEntities: Ref[]; branches: Ref[]; departments: Array<Ref & { branchId: string | null }>; positions: Ref[]; employees: Array<Ref & { code: string }> };

export type TodayState = "not_started" | "working" | "done" | "absent" | "no_shift";
export type TodayRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  shift: { name: string; start: string; end: string } | null;
  clockIn: { at: string; lateMinutes: number; offline: boolean; location: string | null } | null;
  clockOut: { at: string; earlyMinutes: number; offline: boolean; location: string | null } | null;
  state: TodayState;
  late: boolean;
  early: boolean;
  rejectedCount: number;
};
export type AttendanceBoard = {
  date: string;
  timezone: string;
  rows: TodayRow[];
  summary: { inScope: number; present: number; late: number; notYet: number; rejected: number; devicesPending: number };
};

export type OverviewDay = { date: string; present: number; late: number; rejected: number };
export type AdminOverview = {
  date: string;
  activeEmployees: number;
  notActivated: number;
  presentToday: number;
  lateToday: number;
  rejectedToday: number;
  devicesPending: number;
  days: OverviewDay[];
  recentEmployees: EmployeeListItem[];
};

export const ADMIN_ERRORS = {
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  lastTenantAdmin: "LAST_TENANT_ADMIN",
  emailNotConfigured: "EMAIL_NOT_CONFIGURED",
} as const;
