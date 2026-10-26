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
  /* Kavor tạm khóa/đóng công ty: mọi người dùng của tenant bị chặn */
  tenantSuspended: "AUTH_TENANT_SUSPENDED",
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

/* ---------- Cơ cấu tổ chức + vai trò (docs/plans/org-roles.md) ---------- */
export type OrgUnitKind = "legal_entity" | "branch" | "department" | "position";
export const ORG_UNIT_KINDS: Record<OrgUnitKind, string> = { legal_entity: "Pháp nhân", branch: "Chi nhánh", department: "Phòng ban", position: "Chức danh" };
/* parentId: chi nhánh → pháp nhân; phòng ban → phòng ban cha (null nếu cấp cao nhất trong chi nhánh). employees = nhân viên đang phân công trực tiếp */
export type OrgUnit = {
  id: string; kind: OrgUnitKind; code: string; name: string; parentId: string | null; branchId: string | null;
  taxCode: string | null; jobLevel: string | null; effectiveFrom: string; effectiveTo: string | null; active: boolean; employees: number;
};
export type OrgTree = {
  units: OrgUnit[]; today: string; canManage: boolean;
  metrics: { legalEntities: number; branches: number; departments: number; positions: number; managers: number; employees: number };
};
export type OrgUnitInput = { kind: OrgUnitKind; code: string; name: string; parentId?: string | null; branchId?: string | null; taxCode?: string | null; jobLevel?: string | null; effectiveFrom?: string };
export type OrgUnitUpdate = { code?: string; name?: string; taxCode?: string | null; jobLevel?: string | null };

export type RoleAssignmentRow = {
  id: string; employee: { id: string; code: string; fullName: string }; account: AccountStatus;
  scopeType: ScopeType; scopeId: string | null; scopeName: string; effectiveFrom: string; effectiveTo: string | null; state: "active" | "future" | "ended";
};
export type RoleInfo = {
  code: string; name: string; system: boolean; description: string; defaultScope: string;
  /* Vai trò có dữ liệu nhạy cảm (lương, tài khoản ngân hàng, toàn quyền) — cảnh báo khi gán */
  sensitive: boolean; payrollData: string; allowedScopes: ScopeType[];
  permissions: Array<{ code: string; description: string }>; members: number; updatedAt: string | null; assignments: RoleAssignmentRow[];
};
export type RolesBoard = { roles: RoleInfo[]; canAssign: boolean; today: string };
export type RoleAssignInput = { employeeId: string; roleCode: string; scopeType: ScopeType; scopeId?: string | null; effectiveFrom: string; effectiveTo?: string | null };

/* ---------- Nhập nhân viên hàng loạt (docs/plans/employee-import.md) ---------- */
export const EMPLOYEE_IMPORT_COLUMNS = ["employee_code", "full_name", "work_email", "phone", "hire_date", "employment_type", "department_code", "position_code", "manager_code"] as const;
export const EMPLOYEE_IMPORT_REQUIRED = ["employee_code", "full_name", "work_email", "hire_date", "employment_type", "department_code", "position_code"] as const;
export type EmployeeImportRow = {
  line: number; code: string; fullName: string; department: string | null; position: string | null; manager: string | null;
  action: "create" | "exists" | "error"; errors: string[];
};
export type EmployeeImportResult = {
  fileName: string; dryRun: boolean; applied: boolean; fileErrors: string[];
  totals: { rows: number; create: number; exists: number; error: number };
  capacity: { employees: number; limit: number; planName: string };
  rows: EmployeeImportRow[];
};
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
/* ---------- Hồ sơ cá nhân + đề nghị sửa (HR duyệt; Kế toán đọc lại tài khoản đã duyệt) ---------- */
export type ProfileField = "phone" | "personalEmail" | "address" | "emergency" | "bank";
export const PROFILE_FIELDS: Record<ProfileField, string> = { phone: "Điện thoại", personalEmail: "Email cá nhân", address: "Địa chỉ", emergency: "Liên hệ khẩn cấp", bank: "Tài khoản ngân hàng" };
export type EmergencyContact = { name: string; phone: string; relation: string };
/* accountNo chỉ có khi người xem được xem số đầy đủ (chính nhân viên, employee.sensitive.read); còn lại chỉ 4 số cuối */
export type BankAccountView = { bankName: string; holder: string; last4: string; accountNo?: string };
export type ProfileValues = { phone?: string | null; personalEmail?: string | null; address?: string | null; emergency?: EmergencyContact | null; bank?: BankAccountView | null };
/* fields: trường đổi; before/after: giá trị lúc gửi và giá trị đề nghị (chỉ các trường đổi) */
export type ProfileChangePayload = { fields: ProfileField[]; before: ProfileValues; after: ProfileValues; reason: string | null };
export type ProfileChangeInput = {
  phone?: string | null; personalEmail?: string | null; address?: string | null; emergency?: EmergencyContact | null;
  bank?: { bankName: string; accountNo: string; holder: string }; reason?: string | null;
};
export type PersonalInfo = { personalEmail: string | null; address: string | null; emergency: EmergencyContact | null; bank: BankAccountView | null };

/* Hồ sơ của chính nhân viên trên app (chỉ đọc). contract: hợp đồng lao động HR chia sẻ gần nhất (Tài liệu, "HR + Nhân viên", chưa gỡ) */
export type MyProfile = {
  employeeCode: string; fullName: string; position: string | null; department: string | null; branch: string | null; manager: string | null;
  hireDate: string; employmentType: EmploymentType; status: EmployeeStatus; terminationDate: string | null;
  workEmail: string | null; phone: string | null; contract: { title: string; expiresOn: string | null } | null;
  /* Thông tin cá nhân đã duyệt (số tài khoản đầy đủ vì là của chính mình) + đề nghị sửa đang chờ */
  personal: PersonalInfo; pending: { id: string; no: string; fields: ProfileField[] } | null;
};

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
  /* Thông tin cá nhân đã duyệt; số tài khoản đầy đủ chỉ khi người xem có employee.sensitive.read */
  personal: PersonalInfo;
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
  /* Đã đủ số nhân sự tối đa của gói dịch vụ */
  employeeLimitReached: "EMPLOYEE_LIMIT_REACHED",
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
export type TenantProfile = {
  code: string; displayName: string; legalName: string | null; taxCode: string | null; timezone: string; currency: string;
  /* Gói do Kavor gán; employees = hồ sơ chưa nghỉ việc (tính vào giới hạn) */
  plan: { code: PlanCode; name: string; employeeLimit: number; employees: number };
};
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
export type RuleKind = "explanation" | "salary_advance" | "reminder" | "leave" | "overtime";
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
      { key: "deadlineDay", label: "Nhận đơn đến hết ngày", type: "int", min: 1, max: 31, unit: "hằng tháng (31 = cuối tháng)" },
      { key: "minAmount", label: "Số tiền tối thiểu mỗi lần", type: "int", min: 100000, max: 50000000, unit: "₫" },
    ],
  },
  leave: {
    label: "Phép năm",
    description: "Định mức phép năm (không thấp hơn 12 ngày theo Bộ luật Lao động), cách tích lũy, phép thâm niên, phép tồn chuyển năm và hạn dùng.",
    fields: [
      { key: "annualDays", label: "Phép năm tiêu chuẩn", type: "int", min: 12, max: 30, unit: "ngày/năm" },
      { key: "accrualMonthly", label: "Tích lũy theo tháng (tắt: cấp đủ đầu năm)", type: "bool" },
      { key: "seniorityYears", label: "Cứ đủ số năm làm việc", type: "int", min: 0, max: 10, unit: "năm (0 = không áp dụng)" },
      { key: "seniorityBonusDays", label: "Thì được thêm", type: "int", min: 0, max: 5, unit: "ngày" },
      { key: "carryOverMaxDays", label: "Phép tồn được chuyển sang năm sau tối đa", type: "int", min: 0, max: 30, unit: "ngày" },
      { key: "carryOverExpiryMonth", label: "Phép tồn dùng đến hết tháng", type: "int", min: 1, max: 12, unit: "của năm sau" },
      { key: "allowNegativeDays", label: "Cho nghỉ trước phép (âm) tối đa", type: "int", min: 0, max: 5, unit: "ngày, cần HR duyệt" },
      { key: "probationAccrues", label: "Nhân viên thử việc được tích lũy phép", type: "bool" },
    ],
  },
  overtime: {
    label: "Làm thêm giờ",
    description: "Hệ số trả lương làm thêm (không thấp hơn mức luật: 150% ngày thường, 200% ngày nghỉ hằng tuần, 300% ngày lễ), giới hạn giờ và hạn đăng ký.",
    fields: [
      { key: "weekdayRate", label: "Hệ số ngày thường", type: "int", min: 150, max: 400, unit: "%" },
      { key: "weekendRate", label: "Hệ số ngày nghỉ hằng tuần", type: "int", min: 200, max: 500, unit: "%" },
      { key: "holidayRate", label: "Hệ số ngày lễ, Tết", type: "int", min: 300, max: 600, unit: "%" },
      { key: "dailyLimitHours", label: "Tối đa mỗi ngày làm việc", type: "int", min: 0, max: 4, unit: "giờ (ngày nghỉ: tối đa 12 giờ)" },
      { key: "monthlyLimitHours", label: "Tối đa mỗi tháng", type: "int", min: 0, max: 40, unit: "giờ" },
      { key: "yearlyLimitHours", label: "Tối đa mỗi năm", type: "int", min: 0, max: 300, unit: "giờ" },
      { key: "submitAfterDays", label: "Được đăng ký sau khi làm tối đa", type: "int", min: 0, max: 7, unit: "ngày" },
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
  /* Lý do + thời điểm đổi trạng thái gần nhất (tạm khóa/mở lại/đóng) */
  statusReason: string | null; statusChangedAt: string | null;
};
/* Gói dịch vụ do Kavor duy trì; employeeLimit null = theo hợp đồng */
export type PlatformPlan = { code: PlanCode; name: string; employeeLimit: number | null; summary: string; tenants: number };
export type TenantStatusAction = "suspend" | "reactivate" | "close";
export type TenantStatusInput = { action: TenantStatusAction; reason: string; /* đóng tenant: gõ lại mã tenant */ confirmCode?: string };
export type TenantPlanInput = { plan: PlanCode; employeeLimit: number; reason: string };
/* Gần giới hạn: dùng từ 90% giới hạn nhân sự */
export const NEAR_LIMIT_RATIO = 0.9;

/* ---------- Support access có thời hạn (docs/plans/console-ops.md phần B) ---------- */
/* Phạm vi chỉ đọc; không có lương, tài khoản ngân hàng, tài liệu cá nhân, liên hệ cá nhân */
export type SupportScope = "settings" | "directory" | "audit";
export const SUPPORT_SCOPES: Record<SupportScope, { label: string; detail: string }> = {
  settings: { label: "Cấu hình công ty", detail: "Gói, quy định, ngày lễ, luồng duyệt, ca và địa điểm, vai trò (không có người)" },
  directory: { label: "Danh sách nhân sự tối thiểu", detail: "Mã, họ tên, phòng ban, chức danh, trạng thái hồ sơ và tài khoản — không có liên hệ, lương" },
  audit: { label: "Nhật ký hoạt động 30 ngày", detail: "Thời gian, người làm, hành động — không có dữ liệu trước/sau" },
};
export const SUPPORT_MINUTES = [30, 60] as const;
/* expired: yêu cầu chờ quá 24 giờ, hoặc phiên đã hết thời hạn */
export type SupportStatus = "pending" | "active" | "rejected" | "cancelled" | "revoked" | "ended" | "expired";
export type SupportSession = {
  id: string; tenant: { id: string; code: string; name: string }; operator: string;
  ticket: string; reason: string; scopes: SupportScope[]; minutes: number; status: SupportStatus;
  requestedAt: string; requestExpiresAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  startsAt: string | null; expiresAt: string | null; endedAt: string | null;
  /* Console: yêu cầu của chính người đang xem */
  mine: boolean;
};
export type SupportRequestInput = { tenantId: string; ticket: string; reason: string; scopes: SupportScope[]; minutes: number };
/* Banner web HR: mọi người dùng thấy phiên đang hiệu lực; số yêu cầu chờ chỉ người duyệt được thấy */
export type SupportBanner = { pending: number; active: Array<{ id: string; operator: string; expiresAt: string; scopes: SupportScope[] }>; canApprove: boolean };
export type SupportSettingsView = {
  tenant: { code: string; name: string; timezone: string; plan: string; employeeLimit: number; employees: number };
  rules: Array<{ kind: string; name: string; versionNo: number; effectiveFrom: string; config: unknown }>;
  holidays: Array<{ date: string; name: string; scope: "national" | "company" }>;
  workflows: Array<{ requestType: string; name: string; versionNo: number; effectiveFrom: string; steps: unknown }>;
  shifts: Array<{ code: string; name: string; start: string; end: string; workDays: number[] | null }>;
  locations: Array<{ code: string; name: string; radiusM: number; active: boolean }>;
  roles: Array<{ code: string; name: string; system: boolean; permissions: string[]; members: number }>;
};
export type SupportDirectoryRow = { code: string; fullName: string; department: string | null; position: string | null; status: EmployeeStatus; account: AccountStatus };
export type SupportAuditRow = { at: string; actor: string; action: string; resourceType: string };
export type SupportView =
  | { scope: "settings"; session: SupportSession; data: SupportSettingsView }
  | { scope: "directory"; session: SupportSession; data: SupportDirectoryRow[] }
  | { scope: "audit"; session: SupportSession; data: SupportAuditRow[] };
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
  nearLimitTenants: number;
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
export type DayKind = "work" | "off" | "holiday" | "today" | "future" | "not_employed" | "leave";
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
  /* Ngày làm việc theo ca (không phải ngày nghỉ/lễ) — kể cả ngày tương lai */
  workday: boolean;
  /* Nghỉ phép đã duyệt: cả ngày → kind "leave"; nửa ngày vẫn là ngày làm việc, nửa còn lại phải chấm công */
  leave: { typeName: string; half: LeaveHalf; paid: boolean; requestNo: string } | null;
  /* Làm thêm giờ đã duyệt của ngày (cộng các đơn) */
  overtime: { minutes: number; ratePercent: number; requestNos: string[] } | null;
  canExplain: boolean;
  explainDeadline: string | null;
};
export type TimesheetSummary = {
  credited: number; standard: number; lateDays: number; lateMinutes: number; earlyDays: number;
  /* Ngày thiếu dữ liệu chưa có giải trình đang chờ/đã duyệt */
  missingDays: number;
  pendingRequests: number;
  /* Số ngày nghỉ phép đã duyệt trong kỳ (nửa ngày = 0,5); ngày nghỉ có lương đã tính vào credited */
  leaveDays: number;
  /* Phút làm thêm đã duyệt trong kỳ */
  overtimeMinutes: number;
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
export type StepResolver = "direct_manager" | "hr" | "payroll";
export const STEP_RESOLVERS: Record<StepResolver, string> = { direct_manager: "Quản lý trực tiếp", hr: "Phòng Nhân sự", payroll: "Kế toán" };
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "skipped" | "cancelled";
export type RequestStep = {
  taskId: string; stepNo: number; resolver: StepResolver; assignee: string | null; status: StepStatus;
  dueAt: string | null; actedAt: string | null; actedBy: string | null; comment: string | null;
};
export type RequestType = "explanation" | "leave" | "overtime" | "salary_advance" | "profile_change";
export const REQUEST_TYPES: Record<RequestType, string> = { explanation: "Giải trình công", leave: "Nghỉ phép", overtime: "Làm thêm giờ", salary_advance: "Tạm ứng lương", profile_change: "Sửa hồ sơ" };
export type ExplanationPayload = { kind: ExplanationKind; clockIn: string | null; clockOut: string | null; reason: string };
export type LeaveHalf = "full" | "am" | "pm";
export type LeavePayload = { leaveType: string; leaveTypeName: string; from: string; to: string; half: LeaveHalf; days: number; reason: string };
export type OvertimeDayKind = "workday" | "weekend" | "holiday";
export const OVERTIME_DAY_KINDS: Record<OvertimeDayKind, string> = { workday: "ngày thường", weekend: "ngày nghỉ", holiday: "ngày lễ" };
export type OvertimePayload = { date: string; start: string; end: string; hours: number; dayKind: OvertimeDayKind; ratePercent: number; reason: string };
/* month: tháng khấu trừ YYYY-MM */
export type AdvancePayload = { amount: number; month: string; reason: string };
export type AdvancePayout = { paidAt: string; paidBy: string | null; note: string | null };
export type RequestItem = RequestItemBase & ({ type: "explanation"; payload: ExplanationPayload } | { type: "leave"; payload: LeavePayload } | { type: "overtime"; payload: OvertimePayload }
  | { type: "salary_advance"; payload: AdvancePayload; payout: AdvancePayout | null } | { type: "profile_change"; payload: ProfileChangePayload });
type RequestItemBase = {
  id: string; no: string; status: RequestStatus; submittedAt: string; completedAt: string | null;
  workDate: string | null;
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

/* ---------- Tạm ứng lương ---------- */
export type AdvancePolicy = { name: string; versionNo: number; enabled: boolean; maxPercent: number; minAmount: number; deadlineDay: number };
export type MyAdvance = {
  today: string; month: string; policy: AdvancePolicy | null;
  /* Lương cơ bản của chính nhân viên (để hiện cách tính hạn mức) */
  baseSalary: number | null; limit: number;
  /* Không đủ điều kiện: [tiêu đề, giải thích] */
  ineligible: [string, string] | null;
  deadline: string | null; deadlinePassed: boolean;
  /* Đơn của tháng này (đang chờ/đã duyệt) */
  current: RequestItem | null; history: RequestItem[];
  /* Luồng duyệt dự kiến: "Lê Quang Huy → Kế toán" (HR thêm khi trên ngưỡng) */
  approvers: string[]; hrOverAmount: number | null;
};
export type AdvanceInput = { amount: number; reason?: string | null };
export type AdvanceRow = { request: RequestItem; employee: { id: string; code: string; fullName: string; department: string | null } };
export type AdvanceBoard = {
  month: string; rows: AdvanceRow[];
  metrics: { pending: number; toPay: number; paidCount: number; paidAmount: number };
  canProcess: boolean;
};
export type CompensationRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  baseSalary: number | null; effectiveFrom: string | null;
  history: Array<{ baseSalary: number; effectiveFrom: string; note: string | null; createdAt: string }>;
  /* Tài khoản ngân hàng HR đã duyệt (null nếu chưa có hoặc người xem không có employee.sensitive.read) */
  bank: BankAccountView | null;
};
export type CompensationBoard = { rows: CompensationRow[]; canManage: boolean };
export type CompensationInput = { baseSalary: number; effectiveFrom: string; note?: string | null };

/* ---------- Payroll: nhập kết quả từ CSV, không tính lương ---------- */
export type PayComponent = { id: string; code: string; name: string; kind: "earning" | "deduction" | "net"; displayOrder: number };
export type PayrollStatus = "open" | "prepared" | "under_review" | "approved" | "published" | "paid" | "closed";
export type PayrollAction = "submit" | "approve" | "publish" | "paid" | "close" | "reopen";
export type PayrollCycle = {
  id: string; month: string; periodStart: string; periodEnd: string; payDate: string; status: PayrollStatus;
  latestBatchId: string | null; importedBy: string | null; importedAt: string | null; approvedBy: string | null; approvedAt: string | null;
  publishedAt: string | null; paidAt: string | null; closedAt: string | null;
};
/* row = số dòng bắt đầu bản ghi trong CSV (header là 1); null = lỗi/cảnh báo cấp file hoặc kỳ.
   Chẩn đoán không chép giá trị ô tiền hay nội dung ghi chú. */
export type PayrollIssue = { severity: "error" | "warning"; code: string; message: string; row: number | null; column: string | null; employeeCode: string | null };
export type PayrollBatch = {
  id: string; fileName: string; totalRows: number; errorRows: number; createdBy: string; createdAt: string; applied: boolean;
  errors: PayrollIssue[]; warnings: PayrollIssue[];
};
export type PayrollResultItem = PayComponent & { amount: number; label: string | null };
export type PayrollResult = {
  id: string; employee: { id: string; code: string; fullName: string }; batchId: string;
  gross: number; deduction: number; net: number; workDays: number | null; note: string | null; items: PayrollResultItem[];
};
export type PayrollEvent = { id: string; action: string; fromStatus: PayrollStatus | null; toStatus: PayrollStatus; actorUserId: string; employeeId: string | null; reason: string | null; createdAt: string };
export type PayrollBoard = { cycles: PayrollCycle[]; canCreate: boolean };
export type PayrollDetail = {
  cycle: PayrollCycle; components: PayComponent[]; results: PayrollResult[]; batches: PayrollBatch[]; events: PayrollEvent[];
  errors: PayrollIssue[]; warnings: PayrollIssue[]; canImport: boolean; actions: PayrollAction[];
};
export type PayrollCycleInput = { month: string; payDate: string };
export type PayrollImportInput = { fileName: string; csv: string };
export type PayrollImportOutcome = { cycle: PayrollCycle; batch: PayrollBatch };
export type PayrollTransition = { cycle: PayrollCycle };
export type PayrollReopenInput = { reason: string };
export type MyPayslips = { items: Array<{ cycle: PayrollCycle; net: number; workDays: number | null; viewedAt: string | null }> };
export type MyPayslip = { cycle: PayrollCycle; result: PayrollResult; viewedAt: string };

/* ---------- Bản tin nội bộ ---------- */
export type AnnouncementCategory = "notice" | "policy" | "event";
export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, string> = { notice: "Thông báo", policy: "Chính sách", event: "Sự kiện" };
/* draft: chưa xuất bản; scheduled: hẹn giờ; published: đang hiện; archived: đã gỡ */
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";
export const ANNOUNCEMENT_MAX_BYTES = 5 * 1024 * 1024;
export type AnnouncementAttachment = { name: string; type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; size: number };
export type AnnouncementUnit = { type: "branch" | "department"; id: string; name: string };
export type AnnouncementAdmin = {
  id: string; category: AnnouncementCategory; title: string; body: string; authorLabel: string;
  important: boolean; pinned: boolean; notify: boolean; audience: "tenant" | "units"; units: AnnouncementUnit[];
  attachment: AnnouncementAttachment | null; status: AnnouncementStatus;
  publishAt: string | null; notifiedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
  /* Số người nhận hiện tại (nhân viên chưa nghỉ việc thuộc đơn vị đã chọn) và số người đã mở bài */
  recipients: number; reads: number;
};
/* units: chi nhánh/phòng ban để chọn người nhận */
export type AnnouncementBoard = { items: AnnouncementAdmin[]; units: AnnouncementUnit[] };
export type AnnouncementReader = { id: string; code: string; fullName: string; department: string | null; readAt: string | null };
export type AnnouncementDetail = { item: AnnouncementAdmin; readers: AnnouncementReader[] };
export type AnnouncementInput = {
  category: AnnouncementCategory; title: string; body: string; authorLabel: string;
  important: boolean; pinned: boolean; notify: boolean; audience: "tenant" | "units"; units: Array<{ type: "branch" | "department"; id: string }>;
};
/* publishAt null/không có: xuất bản ngay */
export type AnnouncementPublishInput = { publishAt?: string | null };
export type AnnouncementAttachmentInput = { fileName: string; dataBase64: string };
export type MyAnnouncement = {
  id: string; category: AnnouncementCategory; title: string; body: string; authorLabel: string; important: boolean; pinned: boolean;
  publishAt: string; attachment: AnnouncementAttachment | null; readAt: string | null;
};
export type MyAnnouncements = { items: MyAnnouncement[] };

/* Nội dung bản tin là chữ thuần: đoạn cách nhau bằng dòng trống; đoạn mà mọi dòng bắt đầu bằng "- " là danh sách gạch đầu dòng.
   Trả về đúng cấu trúc prototype mobile (string = đoạn, string[] = danh sách). */
export function announcementBlocks(body: string): Array<string | string[]> {
  return body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.every((l) => /^[-•]\s+/.test(l)) ? lines.map((l) => l.replace(/^[-•]\s+/, "")) : lines.join("\n");
  });
}
/* Thời gian đọc ước tính ("1 phút" như prototype): ~200 từ/phút, tối thiểu 1 */
export const announcementReadMinutes = (body: string) => Math.max(1, Math.round(body.trim().split(/\s+/).filter(Boolean).length / 200));

/* ---------- Tài liệu nhân sự ---------- */
export type DocumentCategory = "contract" | "appendix" | "decision" | "personal" | "insurance" | "other";
export const DOCUMENT_CATEGORIES: Record<DocumentCategory, string> = {
  contract: "Hợp đồng lao động", appendix: "Phụ lục hợp đồng", decision: "Quyết định", personal: "Hồ sơ cá nhân", insurance: "Bảo hiểm", other: "Khác",
};
/* hr_employee: HR + nhân viên đó xem được; hr_only: chỉ HR trong phạm vi */
export type DocumentVisibility = "hr_employee" | "hr_only";
/* Hết hạn so với ngày của công ty: soon = trong 30 ngày tới */
export type DocumentExpiry = "none" | "valid" | "soon" | "expired";
export type DocumentFileType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
export type DocumentVersion = {
  id: string; versionNo: number; fileName: string; type: DocumentFileType; size: number; sha256: string;
  scanStatus: "not_scanned" | "clean" | "infected"; note: string | null; createdAt: string;
};
export type EmployeeDocument = {
  id: string; employee: { id: string; code: string; fullName: string; department: string | null };
  category: DocumentCategory; title: string; docNo: string | null; issuedOn: string | null; expiresOn: string | null; expiry: DocumentExpiry;
  visibility: DocumentVisibility; current: DocumentVersion; versionCount: number;
  archivedAt: string | null; archiveReason: string | null; createdAt: string; updatedAt: string;
};
export type DocumentBoard = {
  items: EmployeeDocument[];
  /* missingContract: nhân viên đang làm trong phạm vi chưa có hợp đồng lao động còn hiệu lực; downloadsWeek: lượt tải 7 ngày (audit) */
  metrics: { total: number; expiringSoon: number; expired: number; missingContract: number; downloadsWeek: number };
  canUpload: boolean; canManage: boolean;
};
export type DocumentDetail = { item: EmployeeDocument; versions: DocumentVersion[]; canUpload: boolean; canManage: boolean };
export type DocumentFileInput = { fileName: string; dataBase64: string; note?: string | null };
export type DocumentMeta = { category: DocumentCategory; title: string; docNo?: string | null; issuedOn?: string | null; expiresOn?: string | null; visibility: DocumentVisibility };
export type DocumentInput = DocumentMeta & DocumentFileInput & { employeeId: string };
export type DocumentArchiveInput = { reason: string };
export type MyDocument = {
  id: string; category: DocumentCategory; title: string; docNo: string | null; issuedOn: string | null; expiresOn: string | null; expiry: DocumentExpiry;
  versionNo: number; fileName: string; type: DocumentFileType; size: number; updatedAt: string;
};
export type MyDocuments = { items: MyDocument[] };

/* ---------- Làm thêm giờ ---------- */
export type OvertimePolicy = {
  name: string; versionNo: number;
  weekdayRate: number; weekendRate: number; holidayRate: number;
  dailyLimitHours: number; monthlyLimitHours: number; yearlyLimitHours: number; submitAfterDays: number;
};
export type OvertimeDay = {
  date: string; weekday: number; dayKind: OvertimeDayKind; holiday: string | null;
  /* Giờ ca chính (ngày thường) để không đăng ký trùng */
  shift: { name: string; start: string; end: string } | null;
  booked: Array<{ start: string; end: string; status: RequestStatus; no: string }>;
};
/* used*: giờ đã duyệt + đang chờ (tính vào giới hạn) */
export type OvertimeUsage = { month: string; monthHours: number; monthApproved: number; year: number; yearHours: number };
export type MyOvertime = { today: string; policy: OvertimePolicy | null; days: OvertimeDay[]; usage: OvertimeUsage; approver: string | null };
export type OvertimeInput = { date: string; start: string; end: string; reason: string };
export type OvertimeRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  approvedHours: number; pendingHours: number; yearHours: number; monthLimit: number | null;
  byKind: Record<OvertimeDayKind, number>;
};
export type OvertimeBoard = {
  month: string; rows: OvertimeRow[]; requests: RequestItem[];
  metrics: { approvedHours: number; pendingHours: number; employees: number; nearLimit: number };
};

/* ---------- Nghỉ phép ---------- */
export type LeaveType = {
  id: string; code: string; name: string; paid: boolean; deductsBalance: boolean;
  maxDays: number | null; attachmentFromDays: number | null; description: string | null;
};
/* Sổ phép năm: số dư = tổng giao dịch. granted gồm cấp/tích lũy + thâm niên; carry là phép tồn năm trước (hết hạn thì trừ ở expired) */
export type LeaveBalance = {
  year: number; typeName: string;
  granted: number; carry: number; carryExpiresOn: string | null; expired: number; adjusted: number;
  used: number; pending: number; available: number;
  /* Định mức cả năm theo quy định (để hiển thị "x/12 ngày đã tích lũy") */
  yearEntitlement: number; accrualMonthly: boolean; allowNegative: number;
  policy: { name: string; versionNo: number } | null;
};
export type LeaveTxKind = "grant" | "accrual" | "carry" | "hold" | "release" | "consume" | "adjust" | "expire";
export const LEAVE_TX_KINDS: Record<LeaveTxKind, string> = {
  grant: "Cấp phép", accrual: "Tích lũy", carry: "Phép tồn năm trước", hold: "Giữ chỗ", release: "Trả giữ chỗ", consume: "Đã nghỉ", adjust: "Điều chỉnh", expire: "Hết hạn",
};
export type LeaveLedgerEntry = {
  id: string; kind: LeaveTxKind; amount: number; effectiveOn: string; expiresOn: string | null;
  requestNo: string | null; reason: string | null; createdBy: string | null; createdAt: string;
};
export type LeaveCalendarDay = { date: string; weekday: number; workday: boolean; holiday: string | null; taken: LeaveHalf | null };
export type MyLeave = {
  today: string; balance: LeaveBalance | null; types: LeaveType[];
  /* Lịch để chọn ngày: từ đầu kỳ công đang mở tới 60 ngày sau hôm nay */
  calendar: LeaveCalendarDay[];
  /* Người duyệt bước đầu; HR thêm vào khi số ngày vượt hrOverDays (hoặc khi dùng phép âm) */
  approver: string | null; hrOverDays: number | null;
};
export type LeaveInput = { leaveType: string; from: string; to: string; half?: LeaveHalf; reason: string };
export type LeaveRow = { employee: { id: string; code: string; fullName: string; department: string | null; hireDate: string }; balance: LeaveBalance | null };
export type LeaveBoard = {
  year: number; rows: LeaveRow[]; types: LeaveType[];
  metrics: { available: number; used: number; pending: number; expiringCarry: number; expiringOn: string | null };
  canManage: boolean;
};
export type EmployeeLeave = { employee: LeaveRow["employee"]; year: number; balance: LeaveBalance | null; ledger: LeaveLedgerEntry[]; requests: RequestItem[] };
/* HR điều chỉnh sổ phép: số ngày (+/−, bước 0,5) + lý do; carry = nhập phép tồn năm trước kèm hạn dùng */
export type LeaveAdjustInput = { year: number; amount: number; reason: string; carry?: boolean; expiresOn?: string | null };

/* ---------- Thông báo trong app ---------- */
export type NotificationKind = "approval.pending" | "approval.due" | "request.approved" | "request.rejected" | "device.approved" | "device.rejected" | "advance.paid" | "payslip.published" | "announcement.published";
export type AppNotification = {
  id: string; kind: NotificationKind; title: string; body: string; createdAt: string; readAt: string | null;
  link: { type: "request" | "device" | "payslip" | "announcement"; id: string; no: string | null } | null;
  /* Thông báo "cần bạn duyệt" mà bước duyệt vẫn đang chờ (bấm vào để duyệt) */
  actionable: boolean;
};
export type NotificationFeed = { items: AppNotification[]; unread: number };
/* ids rỗng/không có: đánh dấu tất cả đã đọc */
export type NotificationRead = { ids?: string[] };

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
/* daysOver: bước chỉ áp dụng khi đơn nghỉ dài hơn số ngày này (null/không có: luôn áp dụng) */
/* amountOver: bước chỉ áp dụng khi số tiền tạm ứng lớn hơn (₫) */
export type WorkflowStepInput = { resolver: StepResolver; slaHours: number; daysOver?: number | null; amountOver?: number | null };
export type WorkflowDef = {
  requestType: RequestType; name: string;
  current: { versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string } | null;
  versions: Array<{ versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string; note: string | null; createdAt: string }>;
};
