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
/* privacyAccepted: nhân viên đã tích "Tôi đồng ý…" ở màn kích hoạt → ghi nhận đồng ý điều khoản hiện hành */
export type ActivationVerifyRequest = { email: string; code: string; password: string; privacyAccepted?: boolean; installationId?: string };
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
  /* Ngày làm việc trong tuần theo ISO: 1 = Thứ Hai … 7 = Chủ Nhật */
  workDays: number[];
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
  lateGraceMinutes: number; earlyGraceMinutes: number; workDays: number[]; effectiveFrom: string; note: string | null; createdAt: string;
};
export type ShiftDef = { id: string; code: string; name: string; active: boolean; current: ShiftVersion | null; next: ShiftVersion | null; versions: ShiftVersion[] };
export type ShiftVersionInput = { start: string; end: string; breakStart?: string | null; breakEnd?: string | null; lateGraceMinutes?: number; earlyGraceMinutes?: number; workDays?: number[]; effectiveFrom: string; note?: string | null };

export type LocationVersion = { id: string; versionNo: number; latitude: number; longitude: number; radiusM: number; maxAccuracyM: number; effectiveFrom: string; note: string | null; createdAt: string };
export type LocationDef = { id: string; code: string; name: string; address: string | null; branch: Ref | null; active: boolean; current: LocationVersion | null; next: LocationVersion | null; versions: LocationVersion[] };
export type LocationVersionInput = { latitude: number; longitude: number; radiusM: number; maxAccuracyM: number; effectiveFrom: string; note?: string | null };

export type PolicyKind = "shift" | "work_location" | RuleKind;
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
  /* Tài khoản web HR/Admin phải xác thực hai lớp (TOTP) trước khi dùng */
  mfaRequired: "MFA_REQUIRED",
} as const;

/* ---------- MFA (TOTP) cho web HR/Admin ---------- */
/* verified: phiên hiện tại đã qua bước mã TOTP (aal2) */
export type MfaStatus = { required: boolean; enrolled: boolean; verified: boolean; factorId: string | null };
/* qrCode: ảnh SVG dạng data URI để quét bằng ứng dụng xác thực; secret: nhập tay khi không quét được */
export type MfaEnrollment = { factorId: string; qrCode: string; secret: string; uri: string };
export type MfaVerifyRequest = { factorId: string; code: string };

/* ---------- Cài đặt công ty (ADR 0001 §3–5) ---------- */
export type SupportContact = { phone: string | null; email: string | null; hours: string | null; note: string | null };
export type BrandingKind = "logo" | "cover";
/* version: đổi khi thay ảnh (dùng làm khóa cache); null = chưa có ảnh, client dùng ảnh mặc định của Kavor */
export type Branding = { logoVersion: string | null; coverVersion: string | null };
/* MFA luôn bật cho web HR/Admin; Employee Web và đồng bộ Google Sheets theo gói dịch vụ (Kavor Console) */
export type PlatformPolicy = { mfaRequired: true; employeeWeb: boolean; sheetsAutoSync: boolean; newsReadReceipt: boolean };
export type TenantProfile = { code: string; displayName: string; legalName: string | null; taxCode: string | null; timezone: string; currency: string };
/* Kỳ công: từ ngày periodStartDay tháng trước tới ngày trước đó của tháng này (1 = tháng dương lịch) */
export type AttendanceConfig = { periodStartDay: number };
export type CompanySettings = { tenant: TenantProfile; branding: Branding; support: SupportContact; platform: PlatformPolicy; attendance: AttendanceConfig; updatedAt: string; canManage: boolean };
export type CompanySettingsUpdate = {
  displayName?: string;
  legalName?: string | null;
  taxCode?: string | null;
  support?: Partial<SupportContact>;
  platform?: { newsReadReceipt?: boolean };
  attendance?: { periodStartDay?: number };
};
export type BrandingUpload = { contentType: string; dataBase64: string };

/* Quy định nghiệp vụ có tầng/phiên bản. Mô tả trường dùng chung: web dựng form, API kiểm tra. */
export type RuleKind = "explanation" | "salary_advance" | "reminder";
export type RuleField = { key: string; label: string; type: "int" | "bool"; min?: number; max?: number; unit?: string };
export const RULE_KINDS: Record<RuleKind, { label: string; description: string; fields: RuleField[] }> = {
  explanation: {
    label: "Giải trình công",
    description: "Số lượt nhân viên được giải trình thiếu/sai giờ chấm công mỗi tháng và hạn gửi.",
    fields: [
      { key: "monthlyLimit", label: "Số lượt mỗi tháng", type: "int", min: 0, max: 31, unit: "lượt" },
      { key: "deadlineDays", label: "Hạn gửi sau ngày phát sinh", type: "int", min: 1, max: 31, unit: "ngày" },
    ],
  },
  salary_advance: {
    label: "Tạm ứng lương",
    description: "Hạn mức tạm ứng theo % lương cơ bản và đối tượng được tạm ứng.",
    fields: [
      { key: "enabled", label: "Cho phép tạm ứng", type: "bool" },
      { key: "maxPercent", label: "Hạn mức tối đa", type: "int", min: 0, max: 100, unit: "% lương cơ bản" },
      { key: "excludeProbation", label: "Không áp dụng cho nhân viên thử việc", type: "bool" },
      { key: "excludeNoticePeriod", label: "Không áp dụng trong thời gian báo trước nghỉ việc", type: "bool" },
    ],
  },
  reminder: {
    label: "Nhắc nhở",
    description: "Thời điểm nhắc chấm công và nhắc hạn giải trình trên điện thoại.",
    fields: [
      { key: "clockInBeforeMinutes", label: "Nhắc vào ca trước giờ bắt đầu", type: "int", min: 0, max: 120, unit: "phút" },
      { key: "clockOutAfterMinutes", label: "Nhắc ra ca sau giờ kết thúc", type: "int", min: 0, max: 120, unit: "phút" },
      { key: "explanationDeadline", label: "Nhắc trước hạn giải trình", type: "bool" },
    ],
  },
};
export type RuleConfig = Record<string, number | boolean>;
/* Kiểm tra cấu hình một quy định theo mô tả trường: chỉ giữ trường đã khai báo, thiếu/sai kiểu/ngoài khoảng đều báo lỗi */
export function checkRuleConfig(kind: RuleKind, raw: unknown): { config: RuleConfig; problems: string[] } {
  const spec = RULE_KINDS[kind];
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const config: RuleConfig = {}, problems: string[] = [];
  for (const f of spec.fields) {
    const v = input[f.key];
    if (f.type === "bool") {
      if (typeof v !== "boolean") problems.push(`"${f.label}" phải là bật/tắt.`); else config[f.key] = v;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v < (f.min ?? 0) || v > (f.max ?? 1e9)) {
      problems.push(`"${f.label}" phải là số nguyên từ ${f.min ?? 0} đến ${f.max}.`);
    } else config[f.key] = v;
  }
  return { config, problems };
}
export type RuleVersion = { id: string; versionNo: number; config: RuleConfig; effectiveFrom: string; note: string | null; createdAt: string };
export type RulePolicy = {
  id: string; kind: RuleKind; code: string; name: string; active: boolean;
  current: RuleVersion | null; next: RuleVersion | null; versions: RuleVersion[]; assignments: PolicyAssignment[];
};
export type RulePolicyInput = { kind: RuleKind; code: string; name: string; config: RuleConfig; effectiveFrom: string; note?: string | null };
export type RuleVersionInput = { config: RuleConfig; effectiveFrom: string; note?: string | null };
/* Quy định áp dụng cho một nhân viên vào một ngày, kèm nguồn (tầng nào) */
export type ResolvedRule = { kind: RuleKind; policyId: string; name: string; versionNo: number; config: RuleConfig; source: PolicySource };
export type MyPolicies = { date: string; rules: Partial<Record<RuleKind, ResolvedRule>> };

/* Lịch nghỉ lễ: quốc gia do Kavor duy trì + ngày nghỉ riêng của công ty */
export type HolidayKind = "public" | "company" | "compensatory";
export type Holiday = { id: string; date: string; name: string; kind: HolidayKind; paid: boolean; scope: "national" | "company" };
export type HolidayYear = { year: number; national: { name: string; source: string | null; verified: boolean } | null; holidays: Holiday[] };
export type HolidayInput = { date: string; name: string; kind: "company" | "compensatory"; paid?: boolean };

/* Điều khoản xử lý dữ liệu cá nhân có phiên bản (Nghị định 13/2023/NĐ-CP) */
export type PrivacyTerms = { id: string; versionNo: number; title: string; content: string; publishedAt: string };
export type PrivacyOverview = {
  current: PrivacyTerms | null;
  versions: Array<PrivacyTerms & { consents: number }>;
  /* Nhân viên đã kích hoạt tài khoản trong phạm vi: bao nhiêu người đã đồng ý phiên bản hiện hành */
  accounts: number;
  consentedCurrent: number;
  pending: Array<{ id: string; code: string; fullName: string; lastVersionNo: number | null }>;
};
export type PrivacyTermsInput = { title: string; content: string };
export type PrivacyConsentRequest = { termsId: string; installationId?: string };

/* Checklist thiết lập ban đầu (plan.md §24.1): trạng thái tính từ dữ liệu thật, không đánh dấu tay */
export type SetupStepState = "done" | "todo" | "warn" | "unavailable";
export type SetupStep = { key: string; title: string; detail: string; state: SetupStepState; href: string | null };
export type SetupChecklist = { steps: SetupStep[]; done: number; total: number };

/* ---------- Mobile: thông tin công ty ---------- */
export type MyCompany = {
  tenant: { id: string; code: string; name: string };
  branding: Branding;
  /* null: công ty chưa nhập liên hệ HR */
  support: SupportContact | null;
  /* required: có điều khoản mới chưa đồng ý → app hiện màn đồng ý trước khi dùng tiếp */
  privacy: { required: boolean; terms: PrivacyTerms | null; acceptedVersionNo: number | null };
  holidays: Holiday[];
};

/* ---------- Kavor Console (nhân viên Kavor vận hành nền tảng) ---------- */
export type OperatorRole = "platform_operator" | "platform_support";
export type OperatorMe = { userId: string; email: string; fullName: string; role: OperatorRole };
export type ConsoleAuthResult = { session: AuthSession; operator: OperatorMe };
export type PlanCode = "trial" | "starter" | "growth" | "enterprise";

export type ConsoleTenant = {
  id: string; code: string; name: string; legalName: string | null; plan: PlanCode; status: TenantStatus; employeeLimit: number;
  /* Hồ sơ chưa nghỉ việc · tài khoản đã kích hoạt */
  employees: number; accounts: number;
  admins: { active: number; invited: number };
  createdAt: string;
};
export type TenantAdminInfo = {
  employeeId: string; code: string; fullName: string; email: string | null; account: AccountStatus;
  mfaEnrolled: boolean; lastLoginAt: string | null; invitedAt: string | null;
};
export type RecoveryKind = "mfa_reset" | "grant_admin";
export type RecoveryStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";
export type OwnerRecovery = {
  id: string; tenant: { id: string; code: string; name: string }; kind: RecoveryKind;
  target: { employeeId: string | null; name: string; email: string | null };
  verification: string; reason: string; requestedBy: string; requestedAt: string; expiresAt: string;
  status: RecoveryStatus; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; result: unknown;
  /* Người đang xem là người tạo yêu cầu (không tự duyệt được) */
  mine: boolean;
};
export type ConsoleAuditEntry = {
  id: string; createdAt: string; actor: string; tenant: { id: string; code: string; name: string } | null;
  action: string; resourceType: string; resourceId: string | null; reason: string | null;
};
export type ConsoleTenantDetail = ConsoleTenant & {
  taxCode: string | null; timezone: string; tenantAdmins: TenantAdminInfo[]; recoveries: OwnerRecovery[]; audit: ConsoleAuditEntry[];
};
export type ConsoleOverview = {
  tenants: { total: number; active: number; trial: number; suspended: number };
  employees: number; accounts: number; pendingRecoveries: number;
  /* Chống mất quyền: tenant chỉ còn 1 Tenant Admin hoạt động, hoặc không còn ai */
  singleAdminTenants: number; noActiveAdminTenants: number;
  recentTenants: ConsoleTenant[];
};
export type TenantCreateInput = { code: string; name: string; legalName?: string | null; plan: PlanCode; employeeLimit: number; adminName: string; adminEmail: string };
export type TenantCreateResult = { tenant: ConsoleTenantDetail; invite: { sent: boolean; error: string | null } };
export type RecoveryInput = {
  tenantId: string; kind: RecoveryKind; targetEmployeeId?: string | null; newAdminName?: string | null; newAdminEmail?: string | null;
  verification: string; reason: string;
};

/* ---------- Bảng công tháng, giải trình, luồng duyệt ---------- */
/* Kỳ công gọi theo tháng kết thúc: "2026-10" với ngày bắt đầu 26 là 26/09–25/10 */
export type TimesheetPeriod = { month: string; start: string; end: string; locked: boolean; lockedAt: string | null };
export type DayKind = "work" | "off" | "holiday" | "today" | "future" | "not_employed";
export type DayIssue = "missing_in" | "missing_out" | "absent" | "late" | "early" | "late_early";
export type TimesheetDay = {
  date: string;
  /* ISO 1 = Thứ Hai … 7 = Chủ Nhật */
  weekday: number;
  kind: DayKind;
  holidayName: string | null;
  shift: { name: string; start: string; end: string } | null;
  /* Giờ ghi nhận (HH:MM giờ công ty) sau điều chỉnh; raw* là giờ chấm công gốc */
  clockIn: string | null;
  clockOut: string | null;
  rawIn: string | null;
  rawOut: string | null;
  adjusted: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number;
  /* Ngày công: 1 khi có đủ giờ vào và ra trong ngày làm việc */
  credit: number;
  issue: DayIssue | null;
  request: { id: string; no: string; status: RequestStatus } | null;
  canExplain: boolean;
  explainDeadline: string | null;
};
export type TimesheetSummary = {
  credited: number; standard: number; lateDays: number; lateMinutes: number; earlyDays: number;
  /* Ngày thiếu dữ liệu chưa có giải trình đang chờ/đã duyệt */
  missingDays: number;
  pendingRequests: number;
};
export type ExplanationQuota = { limit: number; used: number; left: number; deadlineDays: number };
export type MyTimesheet = {
  period: TimesheetPeriod; timezone: string; days: TimesheetDay[]; summary: TimesheetSummary;
  /* null: chưa áp dụng quy định giải trình */
  explanation: ExplanationQuota | null;
  /* Người duyệt bước đầu (để hiển thị trên form) */
  approver: string | null;
};

export type ExplanationKind = "missing_in" | "missing_out" | "late" | "early" | "trip" | "device" | "other";
export const EXPLANATION_KINDS: Record<ExplanationKind, string> = {
  missing_in: "Quên chấm vào", missing_out: "Quên chấm ra", late: "Đến muộn có lý do", early: "Về sớm có lý do",
  trip: "Đi công tác", device: "Lỗi thiết bị/GPS", other: "Khác",
};
export type ExplanationInput = { workDate: string; kind: ExplanationKind; clockIn?: string | null; clockOut?: string | null; reason: string };
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type StepResolver = "direct_manager" | "hr";
export const STEP_RESOLVERS: Record<StepResolver, string> = { direct_manager: "Quản lý trực tiếp", hr: "Phòng Nhân sự" };
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "skipped" | "cancelled";
export type RequestStep = {
  taskId: string; stepNo: number; resolver: StepResolver; assignee: string | null; status: StepStatus;
  dueAt: string | null; actedAt: string | null; actedBy: string | null; comment: string | null;
};
export type RequestItem = {
  id: string; no: string; type: "explanation"; status: RequestStatus; submittedAt: string; completedAt: string | null;
  workDate: string | null;
  payload: { kind: ExplanationKind; clockIn: string | null; clockOut: string | null; reason: string };
  requester: { id: string; code: string; fullName: string; department: string | null };
  steps: RequestStep[];
  /* Giờ chấm công gốc của ngày được giải trình, để người duyệt so sánh */
  day: { rawIn: string | null; rawOut: string | null; shift: string | null } | null;
  /* Bước đang chờ mà người xem được duyệt (null nếu không) */
  myTaskId: string | null;
  canCancel: boolean;
};
export type MyApprovals = { canApprove: boolean; items: RequestItem[] };
export type ApprovalDecision = { comment?: string | null };

export type TimesheetRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  summary: TimesheetSummary;
  status: "ok" | "needs_action" | "short";
};
export type TimesheetBoard = {
  period: TimesheetPeriod; timezone: string; periodStartDay: number; rows: TimesheetRow[];
  metrics: { employees: number; full: number; short: number; unexplained: number; lateEmployees: number; lateTimes: number; pendingRequests: number };
  lock: { lockedAt: string; lockedBy: string | null; reason: string | null } | null;
  /* Các kỳ khóa trước đây (để mở lại/đối chiếu) */
  canLock: boolean; canUnlock: boolean;
};
export type EmployeeTimesheet = { period: TimesheetPeriod; timezone: string; employee: TimesheetRow["employee"]; days: TimesheetDay[]; summary: TimesheetSummary; requests: RequestItem[] };
export type RequestQueue = {
  items: Array<RequestItem & { dueAt: string | null; overdue: boolean }>;
  counts: { pending: number; mine: number; overdue: number };
};
export type WorkflowStepInput = { resolver: StepResolver; slaHours: number };
export type WorkflowDef = {
  requestType: "explanation"; name: string;
  current: { versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string } | null;
  versions: Array<{ versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string; note: string | null; createdAt: string }>;
};
