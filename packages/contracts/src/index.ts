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
  consentRequired: "ATT_CONSENT_REQUIRED",
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
  taxCode: string | null; jobLevel: string | null; tier: ManagementTier | null; effectiveFrom: string; effectiveTo: string | null; active: boolean; employees: number;
  /* Phòng ban: trưởng đơn vị (người phụ trách, có thể thuộc phòng khác) */ head: { id: string; name: string; position: string | null } | null;
};
export type OrgTree = {
  units: OrgUnit[]; today: string; canManage: boolean;
  metrics: { legalEntities: number; branches: number; departments: number; positions: number; managers: number; employees: number };
};
export type OrgUnitInput = { kind: OrgUnitKind; code: string; name: string; parentId?: string | null; branchId?: string | null; taxCode?: string | null; jobLevel?: string | null; tier?: ManagementTier | null; effectiveFrom?: string };
export type OrgUnitUpdate = { code?: string; name?: string; taxCode?: string | null; jobLevel?: string | null; tier?: ManagementTier | null };

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
/* Nhận file bất kỳ (xlsx/csv, tiêu đề tự do): API tự khớp cột vào các trường dưới đây; HR đổi được, cách khớp lưu theo công ty */
export const IMPORT_FIELDS = {
  employee_code: "Mã nhân viên", full_name: "Họ và tên", last_name: "Họ", middle_name: "Tên đệm", first_name: "Tên",
  work_email: "Email đăng nhập", phone: "Điện thoại", hire_date: "Ngày vào làm", official_date: "Ngày chính thức",
  employment_type: "Loại hợp đồng", department: "Phòng ban", position: "Chức danh", manager: "Quản lý trực tiếp",
  status: "Trạng thái làm việc", termination_date: "Ngày nghỉ việc",
  birth_date: "Ngày sinh", gender: "Giới tính", id_number: "Số CCCD/CMND", id_issued_on: "Ngày cấp CCCD", id_issued_by: "Nơi cấp CCCD",
  permanent_address: "Địa chỉ thường trú", current_address: "Địa chỉ hiện tại", social_insurance_no: "Số sổ BHXH", tax_code: "Mã số thuế cá nhân",
  bank_account: "Số tài khoản", bank_name: "Ngân hàng", bank_holder: "Chủ tài khoản", base_salary: "Lương cơ bản", insurance_salary: "Lương đóng BHXH",
} as const;
/* Trường nhạy cảm: cần employee.sensitive.read (giấy tờ, ngân hàng, thuế) hoặc compensation.manage (lương); xem trước không hiện giá trị mẫu */
export const IMPORT_SENSITIVE: Partial<Record<ImportField, "sensitive" | "salary">> = {
  id_number: "sensitive", id_issued_on: "sensitive", id_issued_by: "sensitive", social_insurance_no: "sensitive", tax_code: "sensitive",
  bank_account: "sensitive", bank_name: "sensitive", bank_holder: "sensitive", base_salary: "salary", insurance_salary: "salary",
};
export type ImportField = keyof typeof IMPORT_FIELDS;
export type ImportColumn = {
  key: string; header: string; field: ImportField | null;
  /* manual: HR chọn · saved: đã lưu từ lần nhập trước · header: theo tên cột · content: theo nội dung cột */
  source: "manual" | "saved" | "header" | "content" | null;
  later: string | null; samples: string[]; sheets: number;
};
export type ImportSheet = { name: string; included: boolean; selectable: boolean; headerRow: number | null; rows: number; note: string | null };
/* choice: "code:<mã có sẵn>" hoặc "new:<key nhóm>" (tạo mới; key khác chính nó = gộp vào nhóm mới đó) */
export type ImportUnit = {
  key: string; value: string; rows: number; /* live: số người đang làm (còn lại là người đã nghỉ) */ live: number;
  existing: { code: string; name: string; tier: ManagementTier | null } | null; choice: string; suggested: boolean; newCode: string;
  /* Chức danh: cấp quản lý (có sẵn, HR chọn, hoặc suy từ tên — tierInferred) */ tier: ManagementTier | null; tierInferred: boolean;
};
export type ImportOptions = {
  sheets?: Record<string, boolean>; columns?: Record<string, ImportField | "">;
  units?: { department?: Record<string, string>; position?: Record<string, string> };
  dateOrder?: "dmy" | "mdy"; branchId?: string;
  /* Mặc định nhập cả người đã nghỉ (hồ sơ tra cứu); false = bỏ qua */ includeLeft?: boolean;
  tiers?: Record<string, ManagementTier>;
};
export type ImportAnalysis = {
  sheets: ImportSheet[]; columns: ImportColumn[]; dateOrder: { value: "dmy" | "mdy"; ambiguous: boolean };
  departments: ImportUnit[]; positions: ImportUnit[];
  branches: Array<{ id: string; name: string }>; branchId: string | null; /* Thông báo không chặn (thiếu quyền nhập dữ liệu nhạy cảm/lương) */ notices: string[];
  catalog: { departments: Array<{ code: string; name: string }>; positions: Array<{ code: string; name: string }> };
};
export type EmployeeImportRow = {
  sheet: string; line: number; code: string; fullName: string; department: string | null; position: string | null; manager: string | null;
  action: "create" | "exists" | "fill" | "skip" | "error"; left: boolean; errors: string[]; warnings: string[];
};
/* Gửi lời mời kích hoạt cho nhiều người (sau khi nhập file); người không đủ điều kiện bị bỏ qua kèm lý do */
export type BulkInviteResult = { sent: number; skipped: Array<{ code: string; reason: string }> };
export type EmployeeImportResult = {
  fileName: string; dryRun: boolean; applied: boolean; fileErrors: string[];
  totals: { rows: number; create: number; createLeft: number; exists: number; fill: number; skip: number; error: number; warning: number };
  capacity: { employees: number; limit: number; planName: string };
  rows: EmployeeImportRow[]; analysis: ImportAnalysis;
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
export type PersonalInfo = {
  personalEmail: string | null; address: string | null; emergency: EmergencyContact | null; bank: BankAccountView | null;
  /* Hồ sơ nhập từ file; số CCCD/sổ BHXH chỉ hiện đủ khi được xem dữ liệu nhạy cảm (còn lại 4 số cuối) */
  birthDate?: string | null; gender?: "male" | "female" | "other" | null; idNumber?: string | null; idIssuedOn?: string | null; idIssuedBy?: string | null;
  permanentAddress?: string | null; socialInsuranceNo?: string | null;
};

/* Hồ sơ của chính nhân viên trên app (chỉ đọc). contract: hợp đồng lao động HR chia sẻ gần nhất (Tài liệu, "HR + Nhân viên", chưa gỡ) */
export type MyProfile = {
  employeeCode: string; fullName: string; position: string | null; department: string | null; branch: string | null; manager: string | null;
  hireDate: string; employmentType: EmploymentType; status: EmployeeStatus; terminationDate: string | null;
  workEmail: string | null; phone: string | null; contract: { title: string; expiresOn: string | null } | null;
  /* Thông tin cá nhân đã duyệt (số tài khoản đầy đủ vì là của chính mình) + đề nghị sửa đang chờ */
  personal: PersonalInfo; pending: { id: string; no: string; fields: ProfileField[] } | null;
  /* Ảnh đại diện (null = chưa có, hiện chữ viết tắt); đổi mỗi lần thay ảnh, dùng làm khóa cache: GET /me/avatar?v= */
  avatarVersion: string | null;
};
/* Nhân viên tự đổi ảnh đại diện trên app (ảnh đã cắt vuông, PNG/JPEG/WebP ≤ 2 MB) */
export type AvatarUploadRequest = { dataBase64: string };

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
  /* Vai trò đang giữ (còn hiệu lực hôm nay, trừ Nhân viên): một người giữ được nhiều vai trò, quyền cộng dồn */
  roles: Array<{ code: string; name: string; scope: string }>;
  /* Cấp bậc theo chức danh (khác quyền trên Kavor) + số người đang báo cáo trực tiếp */
  tier: ManagementTier | null; directReports: number;
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

/* Cấp quản lý của chức danh (tách khỏi ngạch jobLevel): quản lý trực tiếp phải có cấp cao hơn, Ban Giám đốc được quản lý Ban Giám đốc;
   một bên chưa phân cấp thì không chặn */
export type ManagementTier = 1 | 2 | 3 | 4;
export const MANAGEMENT_TIERS: Record<ManagementTier, string> = { 1: "Nhân viên", 2: "Trưởng nhóm", 3: "Quản lý", 4: "Ban Giám đốc" };
export const MANAGEMENT_TIERS_EN: Record<ManagementTier, string> = { 1: "Staff", 2: "Team Lead", 3: "Manager", 4: "Director" };
/* Hệ cấp bậc chuẩn Kavor: suy cấp từ tên chức danh tự do của công ty (Việt/Anh). Tiếng Việt từ chức vụ đứng đầu ("Quản lý sàn", không phải
   "Nhân viên quản lý kho"); tiếng Anh đứng cuối nên khớp ở bất kỳ vị trí ("Sales Manager"). Không khớp gì = Nhân viên. HR đổi được. */
const tierNorm = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const TIER_RULES: Array<[ManagementTier, string[], string[]]> = [
  [4, ["tong giam doc", "pho tong giam doc", "giam doc", "pho giam doc", "chu tich", "pho chu tich", "ban giam doc", "gd", "pgd", "tgd"], ["ceo", "cfo", "coo", "cto", "cmo", "chro", "chief", "director", "president", "founder", "co founder", "bod", "general manager", "gm"]],
  [3, ["truong phong", "pho phong", "quan ly", "truong bo phan", "truong ban", "truong chi nhanh", "truong khoi", "quan doc", "truong van phong", "ke toan truong"], ["manager", "head", "ke toan truong"]],
  [2, ["truong nhom", "nhom truong", "to truong", "to pho", "giam sat", "truong ca", "nhom pho"], ["leader", "lead", "team lead", "supervisor", "captain"]],
];
export function inferTier(title: string): ManagementTier {
  const n = tierNorm(title);
  for (const [tier, head, any] of TIER_RULES) if (head.some((k) => n.startsWith(` ${k} `)) || any.some((k) => n.includes(` ${k} `))) return tier;
  return 1;
}
/* "Sắp xếp tự động" ở Cơ cấu tổ chức: đề xuất cấp cho chức danh + quản lý trực tiếp cho nhân viên đang làm; HR xem rồi áp dụng một lần */
export type StructurePosition = { id: string; code: string; name: string; current: ManagementTier | null; suggested: ManagementTier; tier: ManagementTier; people: number };
export type StructureRow = {
  employeeId: string; code: string; name: string; department: string | null; position: string | null; tier: ManagementTier | null;
  current: { id: string; name: string } | null; currentOk: boolean; proposed: { id: string; name: string } | null; change: boolean; note: string | null;
};
export type StructureGrant = { employeeId: string; name: string; position: string | null; reports: number; selected: boolean };
export type StructurePlan = {
  today: string; positions: StructurePosition[]; rows: StructureRow[]; grants: StructureGrant[]; canGrant: boolean;
  changes: { tiers: number; managers: number; grants: number };
};
/* tiers: cấp HR chọn theo id chức danh; overwrite: đề xuất lại cả người đã có quản lý hợp lệ; skip: nhân viên HR bỏ chọn;
   grantManager: gán vai trò Quản lý (Nhân viên trực tiếp) cho người đang/ sẽ quản lý người khác mà chưa có quyền duyệt; skipGrant: bỏ chọn */
export type StructureInput = { tiers?: Record<string, ManagementTier>; overwrite?: boolean; skip?: string[]; grantManager?: boolean; skipGrant?: string[] };
export const managerTierOk = (manager: number | null | undefined, employee: number | null | undefined) =>
  manager == null || employee == null || manager > employee || (manager === 4 && employee === 4);

/* employees[].roles: mã vai trò đang giữ (trừ Nhân viên) — để gợi ý gán vai trò Quản lý khi chọn quản lý trực tiếp */
export type OrgOptions = { legalEntities: Ref[]; branches: Ref[]; departments: Array<Ref & { branchId: string | null }>; positions: Array<Ref & { tier: ManagementTier | null }>;
  employees: Array<Ref & { code: string; roles: string[]; tier: ManagementTier | null; position: string | null; department: string | null }> };

export type TodayState = "not_started" | "working" | "done" | "absent" | "no_shift" | "off";
export type TodayRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  shift: { name: string; start: string; end: string } | null;
  clockIn: { at: string; lateMinutes: number; offline: boolean; location: string | null } | null;
  clockOut: { at: string; earlyMinutes: number; offline: boolean; location: string | null } | null;
  state: TodayState;
  late: boolean;
  early: boolean;
  rejectedCount: number;
  /* Nghỉ phép đã duyệt của ngày (cả ngày hoặc nửa ngày) */
  leave: { typeName: string; half: LeaveHalf } | null;
};
export type AttendanceBoard = {
  date: string;
  timezone: string;
  rows: TodayRow[];
  /* notYet không gồm người nghỉ phép cả ngày (onLeave) */
  summary: { inScope: number; present: number; late: number; notYet: number; onLeave: number; rejected: number; devicesPending: number };
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
/* Quy chế lương do công ty chọn, có phiên bản theo ngày hiệu lực (tra theo ngày cuối kỳ lương) */
export type ProbationContract = "separate" | "in_contract";
export type PayrollConfig = {
  region: 1 | 2 | 3 | 4;
  /* Lương thử việc = tỷ lệ × lương cứng (BLLĐ 2019 Điều 26: ít nhất 85%) */
  probationRate: number;
  /* true: thử việc vẫn có từng dòng phụ cấp (cũng nhân tỷ lệ); false: một dòng lương thử việc, không dòng phụ cấp */
  probationAllowances: boolean;
  /* Mặc định khi hồ sơ không ghi: separate = HĐ thử việc riêng (không BH, khấu trừ 10%) · in_contract = thử việc trong HĐLĐ (đóng BH, lũy tiến) */
  probationContract: ProbationContract;
  /* collect: có thu đoàn phí qua lương; rate null = theo tham số luật Kavor duy trì */
  unionFee: { collect: boolean; rate: number | null };
  /* total: (lương + khoản theo công) ÷ công chuẩn × công thực tế, làm tròn một lần · per_item: làm tròn từng khoản */
  prorate: "total" | "per_item";
  /* Ngày phiên bản bắt đầu hiệu lực (null = mặc định Kavor, công ty chưa lưu) */
  effectiveFrom: string | null;
};
export type CompanySettings = { tenant: TenantProfile; branding: Branding; support: SupportContact; platform: PlatformPolicy; attendance: AttendanceConfig; payroll: PayrollConfig; updatedAt: string; canManage: boolean };
export type CompanySettingsUpdate = {
  displayName?: string;
  legalName?: string | null;
  taxCode?: string | null;
  support?: Partial<SupportContact>;
  platform?: { newsReadReceipt?: boolean };
  attendance?: { periodStartDay?: number };
  /* Lưu thành phiên bản từ effectiveFrom (trống = hôm nay); trùng ngày = sửa phiên bản đó */
  payroll?: Partial<Omit<PayrollConfig, "unionFee">> & { unionFee?: { collect: boolean; rate: number | null } };
};
export type BrandingUpload = { contentType: string; dataBase64: string };

/* Quy định nghiệp vụ có tầng/phiên bản. Mô tả trường dùng chung: web dựng form, API kiểm tra. */
export type RuleKind = "explanation" | "salary_advance" | "reminder" | "leave" | "overtime";
/* default: dùng khi phiên bản quy định cũ chưa có trường này (trường thêm sau) */
/* unit: đơn vị ngắn ghi cạnh nhãn; note: giải thích/căn cứ luật, hiện dưới ô nhập (không nhét vào nhãn để các ô thẳng hàng) */
export type RuleField = { key: string; label: string; type: "int" | "bool"; min?: number; max?: number; unit?: string; note?: string; default?: number | boolean };
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
      { key: "deadlineDay", label: "Nhận đơn đến hết ngày", type: "int", min: 1, max: 31, unit: "hằng tháng", note: "31 = cuối tháng" },
      { key: "minAmount", label: "Số tiền tối thiểu mỗi lần", type: "int", min: 100000, max: 50000000, unit: "₫" },
    ],
  },
  leave: {
    label: "Phép năm",
    description: "Định mức phép năm (không thấp hơn 12 ngày theo Bộ luật Lao động), cách tích lũy, phép thâm niên, phép tồn chuyển năm và hạn dùng.",
    fields: [
      { key: "annualDays", label: "Phép năm tiêu chuẩn", type: "int", min: 12, max: 30, unit: "ngày/năm" },
      { key: "accrualMonthly", label: "Tích lũy theo tháng (tắt: cấp đủ đầu năm)", type: "bool" },
      { key: "seniorityYears", label: "Cứ đủ số năm làm việc", type: "int", min: 0, max: 10, unit: "năm", note: "0 = không áp dụng" },
      { key: "seniorityBonusDays", label: "Thì được thêm", type: "int", min: 0, max: 5, unit: "ngày" },
      { key: "carryOverMaxDays", label: "Phép tồn được chuyển sang năm sau tối đa", type: "int", min: 0, max: 30, unit: "ngày" },
      { key: "carryOverExpiryMonth", label: "Phép tồn dùng đến hết tháng", type: "int", min: 1, max: 12, unit: "của năm sau" },
      { key: "allowNegativeDays", label: "Cho nghỉ trước phép (âm) tối đa", type: "int", min: 0, max: 5, unit: "ngày", note: "Cần HR duyệt" },
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
      { key: "dailyLimitHours", label: "Tối đa mỗi ngày làm việc", type: "int", min: 0, max: 4, unit: "giờ", note: "Luật: không quá 50% giờ làm bình thường" },
      { key: "offDayLimitHours", label: "Tối đa mỗi ngày nghỉ, lễ", type: "int", min: 0, max: 12, unit: "giờ", note: "Luật: tối đa 12 giờ", default: 12 },
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
    const v = input[f.key] === undefined ? f.default : input[f.key];
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
/* platform_admin: mọi việc của platform_operator + quản lý nhân viên Kavor; platform_support: chỉ xem, yêu cầu quyền hỗ trợ */
export type OperatorRole = "platform_admin" | "platform_operator" | "platform_support";
export const OPERATOR_ROLES: Record<OperatorRole, { label: string; detail: string }> = {
  platform_admin: { label: "Quản trị Console", detail: "Toàn quyền vận hành + mời, đổi vai trò, khóa nhân viên Kavor" },
  platform_operator: { label: "Vận hành nền tảng", detail: "Tạo doanh nghiệp, đổi gói, tạm khóa/mở lại, khôi phục chủ sở hữu" },
  platform_support: { label: "Hỗ trợ Kavor", detail: "Xem doanh nghiệp, yêu cầu quyền hỗ trợ — không đổi gói/trạng thái" },
};
/* Vai trò được thay đổi dữ liệu khách hàng (tạo/khóa doanh nghiệp, đổi gói, duyệt khôi phục) */
export const canOperate = (r: OperatorRole) => r === "platform_admin" || r === "platform_operator";
export type ConsoleOperator = {
  userId: string; email: string; fullName: string; role: OperatorRole; status: "active" | "disabled";
  /* đã liên kết ứng dụng xác thực */ mfa: boolean; lastSignInAt: string | null; createdAt: string; self: boolean;
};
/* expired: quá 7 ngày chưa kích hoạt */
export type OperatorInvite = {
  id: string; email: string; fullName: string; role: OperatorRole; status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string; sentAt: string | null; expiresAt: string; createdAt: string;
};
export type ConsoleOperators = { operators: ConsoleOperator[]; invites: OperatorInvite[] };
export type OperatorInviteInput = { email: string; fullName: string; role: OperatorRole };
export type OperatorInviteResult = { invite: OperatorInvite; mail: { sent: boolean; error: string | null } };
export type OperatorUpdateInput = { role?: OperatorRole; status?: "active" | "disabled"; reason: string };
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
export type TenantCreateInput = { code: string; name: string; legalName?: string | null; plan: PlanCode; employeeLimit: number; adminName: string; adminEmail: string; /* bỏ trống = ADMIN01 */ adminCode?: string | null };
/* Xóa hẳn doanh nghiệp: số dòng dữ liệu, tài khoản đăng nhập, file đã xóa; warnings: phần chưa xóa được (cần dọn tay) */
export type TenantDeleteResult = { code: string; name: string; rows: number; accounts: number; files: number; warnings: string[] };
export type TenantDeleteInput = { confirmCode: string; reason: string };
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
  /* Ngày lễ rơi vào ngày làm việc theo ca: hưởng nguyên lương, tính vào công chuẩn và 1 công (bản lưu cũ không có) */
  paidHoliday?: boolean;
  /* Nghỉ phép đã duyệt: cả ngày → kind "leave"; nửa ngày vẫn là ngày làm việc, nửa còn lại phải chấm công */
  leave: { typeName: string; half: LeaveHalf; paid: boolean; requestNo: string } | null;
  /* Làm thêm giờ đã duyệt của ngày (cộng các đơn). minutes = giờ được tính (phần trùng với giờ vào → ra), approvedMinutes = giờ trên đơn;
     checked = false với hôm nay/ngày tới (chưa đối chiếu, minutes = 0). */
  overtime: { minutes: number; approvedMinutes: number; checked: boolean; ratePercent: number; requestNos: string[] } | null;
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
  /* Phút làm thêm được tính trong kỳ (đã đối chiếu chấm công) và phút trên các đơn đã duyệt */
  overtimeMinutes: number;
  overtimeApprovedMinutes: number;
  /* Ngày đã qua có giờ chấm công không phủ hết giờ OT đã duyệt */
  overtimeShortDays: number;
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
/* Chấm công thực tế của ngày làm thêm (đọc lúc xem, sau điều chỉnh) để nhân viên/người duyệt đối chiếu — không chặn đăng ký/duyệt
   (công tác xa vẫn làm thêm được; bảng công chỉ tính phần khớp giờ vào → ra). matchedMinutes/minutes: phút của đơn khớp chấm công / phút trên đơn;
   checked = false với hôm nay (chưa đối chiếu). */
export type OvertimeAttendance = { clockIn: string | null; clockOut: string | null; adjusted: boolean; checked: boolean; matchedMinutes: number; minutes: number };
const otHours = (min: number) => String(Math.round(min / 6) / 10).replace(".", ",");
/* Chữ hiển thị chung web/app: "Vào 07:54 · Ra 20:36 · khớp 3/3 giờ OT" */
export function overtimeAttendanceText(a: OvertimeAttendance): string {
  const times = a.clockIn || a.clockOut ? `Vào ${a.clockIn ?? "--:--"} · Ra ${a.clockOut ?? "--:--"}${a.adjusted ? " (đã điều chỉnh)" : ""}` : "Không có chấm công";
  return `${times} · ${a.checked ? `khớp ${otHours(a.matchedMinutes)}/${otHours(a.minutes)} giờ OT` : "chưa đối chiếu (hôm nay)"}`;
}
/* Ngày đã qua mà chấm công không phủ hết giờ trên đơn: bảng công chỉ tính phần khớp */
export const overtimeAttendanceShort = (a: OvertimeAttendance | null) => !!a?.checked && a.matchedMinutes < a.minutes;
export type RequestItem = RequestItemBase & ({ type: "explanation"; payload: ExplanationPayload } | { type: "leave"; payload: LeavePayload }
  | { type: "overtime"; payload: OvertimePayload; attendance: OvertimeAttendance | null }
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
  /* Minh chứng (giải trình, nghỉ phép): tối đa REQUEST_ATTACHMENT_MAX file; đơn nghỉ đủ số ngày theo loại nghỉ thì bắt buộc,
     bước duyệt cuối bị chặn khi chưa có. canAttach: người gửi, đơn đang chờ, chưa đủ số file */
  attachments: RequestAttachment[];
  attachmentRequired: boolean;
  canAttach: boolean;
};
export type RequestAttachment = { id: string; name: string; type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; size: number; createdAt: string };
export const REQUEST_ATTACHMENT_MAX = 3;
/* Tải minh chứng: tên file + nội dung base64 (PDF/PNG/JPEG/WebP ≤ 5 MB) */
export type RequestAttachmentInput = { fileName: string; dataBase64: string };
export type MyApprovals = { canApprove: boolean; items: RequestItem[] };
export type ApprovalDecision = { comment?: string | null };

/* ---------- Tạm ứng lương ---------- */
export type AdvancePolicy = { name: string; versionNo: number; enabled: boolean; maxPercent: number; minAmount: number; deadlineDay: number };
export type MyAdvance = {
  today: string; month: string; policy: AdvancePolicy | null;
  /* Lương cơ bản của chính nhân viên (để hiện cách tính hạn mức) */
  /* fixedSalary = lương cứng (lương cơ bản + phụ cấp), hạn mức tính trên con số này */
  baseSalary: number | null; fixedSalary: number | null; limit: number;
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
  baseSalary: number | null; fixedSalary: number | null; effectiveFrom: string | null;
  /* Danh sách tổng quan: items trong history để trống — chi tiết khoản đọc ở employees/:id/pay */
  history: CompensationVersion[];
  /* Tài khoản ngân hàng HR đã duyệt (null nếu chưa có hoặc người xem không có employee.sensitive.read) */
  bank: BankAccountView | null;
};
export type CompensationBoard = { rows: CompensationRow[]; canManage: boolean };
export type CompensationInput = {
  baseSalary: number; effectiveFrom: string; note?: string | null;
  /* null/bỏ trống = bằng lương cơ bản */
  insuranceSalary?: number | null;
  /* Số tiền từng khoản trong danh mục của doanh nghiệp; tổng phụ cấp = tổng các khoản */
  items?: Array<{ itemId: string; amount: number }>;
  /* null/bỏ trống = theo hồ sơ */
  employmentType?: EmploymentType | null;
};

/* ---------- Lương đầu vào (HCNS): mục "Lương" trong hồ sơ nhân viên ---------- */
/* Danh mục khoản thu nhập (phụ cấp/thưởng) do doanh nghiệp tự khai; số tiền do doanh nghiệp tự nhập */
export type PayItemMode = "by_workdays" | "fixed" | "conditional";
export type PayItemTax = "taxable" | "exempt" | "partial" | "meal";
export type PayItem = {
  id: string; name: string; kind: "allowance" | "bonus";
  /* by_workdays: chia theo công · fixed: đủ tháng trả đủ · conditional: có điều kiện (ví dụ chuyên cần) */
  payMode: PayItemMode; insurable: boolean;
  /* partial: miễn thuế đến taxFreeCap ₫/tháng · meal: ăn giữa ca, miễn đến mức luật (PayrollLawParams.taxFree.meal) */
  taxMode: PayItemTax; taxFreeCap: number | null;
  /* Mức gợi ý khi nhập lương (null = không có) */
  defaultAmount: number | null;
  sortOrder: number; note: string | null; archived: boolean;
};
export type PayItemInput = Omit<PayItem, "id" | "archived" | "sortOrder"> & { sortOrder?: number };
export type PayItemList = { items: PayItem[]; canManage: boolean };
export type CompensationItem = { itemId: string; name: string; amount: number };
export type CompensationVersion = {
  baseSalary: number; insuranceSalary: number | null;
  /* Tổng các khoản; lương cứng = baseSalary + allowance */
  allowance: number; items: CompensationItem[]; employmentType: EmploymentType | null;
  effectiveFrom: string; note: string | null; createdAt: string;
};
export type EmployeeDependent = {
  id: string; fullName: string; relation: string; birthDate: string | null; taxCode: string | null;
  /* YYYY-MM; toMonth null = đang tính giảm trừ */
  fromMonth: string; toMonth: string | null;
};
export type DependentInput = { fullName: string; relation: string; birthDate?: string | null; taxCode?: string | null; fromMonth: string; toMonth?: string | null };
export type TaxProfileInput = { taxCode: string | null; unionMember: boolean; probationContract?: ProbationContract | null; commitment08?: boolean; withholdingRequested?: boolean };
export type EmployeePay = {
  employmentType: EmploymentType;
  /* Bản đang hiệu lực hôm nay (null = chưa nhập); history mới nhất trước, gồm cả bản tương lai */
  current: CompensationVersion | null;
  history: CompensationVersion[];
  taxCode: string | null; unionMember: boolean;
  /* null = theo quy chế lương công ty */ probationContract: ProbationContract | null;
  /* Cam kết 08/CK-TNCN: không khấu trừ 10% · yêu cầu khấu trừ 10% cả khi dưới ngưỡng */ commitment08: boolean; withholdingRequested: boolean;
  dependents: EmployeeDependent[];
  /* Số người phụ thuộc đang tính giảm trừ tháng này */
  activeDependents: number;
  canManage: boolean;
};

/* ---------- Bảng lương đầu vào theo kỳ (HCNS lập → Kế toán tính lương) ---------- */
export type PayrollInputSegment = {
  from: string; to: string; baseSalary: number | null; insuranceSalary: number | null; allowance: number;
  items?: CompensationItem[]; employmentType: EmploymentType; credited: number;
};
export type PayrollInputRow = {
  employee: { id: string; code: string; fullName: string; department: string | null; position: string | null; email: string | null; hireDate: string; terminationDate: string | null };
  employmentType: EmploymentType;
  /* Mức lương hiệu lực ngày cuối kỳ (hoặc ngày nghỉ việc) */
  baseSalary: number | null; insuranceSalary: number | null; allowance: number;
  /* Từng khoản (bản chốt trước khi có danh mục không có trường này); lương cứng = baseSalary + allowance */
  items?: CompensationItem[];
  /* Nhiều hơn một đoạn khi đổi lương/tình trạng lao động trong kỳ */
  segments: PayrollInputSegment[];
  standard: number; credited: number; paidLeaveDays: number; unpaidLeaveDays: number; holidays: number;
  lateMinutes: number; missingDays: number;
  /* Phút OT được tính theo hệ số (%), ví dụ { "150": 120, "200": 60 } */
  overtime: Record<string, number>;
  dependents: number; taxCode: string | null; unionMember: boolean;
  /* Bản chốt cũ không có các trường này */
  probationContract?: ProbationContract | null; commitment08?: boolean; withholdingRequested?: boolean;
  /* Tạm ứng đã chi, khấu trừ tháng này */
  advance: number;
  bank: BankAccountView | null;
  /* Cảnh báo cho HCNS rà trước khi chốt */
  warnings: string[];
};
export type PayrollInputSheet = {
  month: string; period: TimesheetPeriod; rows: PayrollInputRow[];
  /* Lần chốt gần nhất (null = chưa chốt); rows là ảnh chụp khi xem bản đã chốt */
  finalized: { at: string; by: string | null; note: string | null; versions: number } | null;
  /* "live": tính từ dữ liệu hiện tại · "final": bản đã chốt */
  source: "live" | "final";
  canFinalize: boolean;
  totals: { employees: number; warnings: number; noSalary: number };
};

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
/* draft: chưa xuất bản; scheduled: hẹn giờ; published: đang hiện; expired: quá "Hiển thị đến" (tự ẩn trên app); archived: đã gỡ */
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "expired" | "archived";
export const ANNOUNCEMENT_MAX_BYTES = 5 * 1024 * 1024;
export type AnnouncementAttachment = { name: string; type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; size: number };
export type AnnouncementUnit = { type: "branch" | "department"; id: string; name: string };
export type AnnouncementAdmin = {
  id: string; category: AnnouncementCategory; title: string; body: string; authorLabel: string;
  important: boolean; pinned: boolean; notify: boolean; audience: "tenant" | "units"; units: AnnouncementUnit[];
  attachment: AnnouncementAttachment | null; status: AnnouncementStatus;
  /* visibleUntil: giờ bài tự ẩn trên app (null = tới khi gỡ) */
  publishAt: string | null; visibleUntil: string | null; notifiedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
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
  /* ISO có múi giờ; null/không có = hiển thị tới khi gỡ */
  visibleUntil?: string | null;
};
/* publishAt null/không có: xuất bản ngay */
export type AnnouncementPublishInput = { publishAt?: string | null };
export type AnnouncementAttachmentInput = { fileName: string; dataBase64: string };
export type MyAnnouncement = {
  id: string; category: AnnouncementCategory; title: string; body: string; authorLabel: string; important: boolean; pinned: boolean;
  publishAt: string; visibleUntil: string | null; attachment: AnnouncementAttachment | null; readAt: string | null;
};
export type MyAnnouncements = { items: MyAnnouncement[] };

/* ---------- Nội dung bản tin có định dạng ----------
   Lưu dạng chữ có ký hiệu (gần Markdown, không HTML) để an toàn và bài cũ (chữ thuần) vẫn đọc đúng. Mỗi dòng:
     dòng trống = hết đoạn · "---" = đường kẻ · "## " = tiêu đề mục · "- " / "1. " = danh sách chấm/số (thụt 2 dấu cách mỗi cấp)
     "> " / ">> " = đoạn thụt lề 1/2 cấp · dòng khác = đoạn văn (các dòng liền nhau là một đoạn, giữ xuống dòng).
   Trong dòng: **đậm**, *nghiêng*, ++gạch chân++; "\" trước một ký tự để giữ nguyên ký tự đó.
   Trình soạn web (apps/admin-web/app/_ui/rich-text.tsx) đọc/ghi đúng dạng này; mobile và web hiển thị qua parseAnnouncement. */
export type AnnouncementInline = { text: string; b?: true; i?: true; u?: true };
export type AnnouncementListItem = { ordered: boolean; level: number; content: AnnouncementInline[] };
export type AnnouncementBlock =
  | { kind: "p"; indent: number; lines: AnnouncementInline[][] }
  | { kind: "h"; content: AnnouncementInline[] }
  | { kind: "list"; items: AnnouncementListItem[] }
  | { kind: "hr" };

export const ANNOUNCEMENT_MAX_LEVEL = 3;
type Mark = "b" | "i" | "u";
const MARKS: Array<[string, Mark]> = [["**", "b"], ["++", "u"], ["*", "i"]];

export function parseAnnouncementInline(line: string): AnnouncementInline[] {
  /* Tách chữ và ký hiệu; ký hiệu không có cặp (lẻ ở cuối) thành chữ thường */
  const toks: Array<{ text: string; mark?: Mark }> = [];
  for (let k = 0; k < line.length;) {
    if (line[k] === "\\" && k + 1 < line.length) { toks.push({ text: line[k + 1]! }); k += 2; continue; }
    const m = MARKS.find(([sym]) => line.startsWith(sym, k));
    if (m) { toks.push({ text: m[0], mark: m[1] }); k += m[0].length; continue; }
    toks.push({ text: line[k]! }); k++;
  }
  for (const [, mark] of MARKS) {
    const at = toks.flatMap((t, n) => (t.mark === mark ? [n] : []));
    if (at.length % 2) delete toks[at[at.length - 1]!]!.mark;
  }
  const out: AnnouncementInline[] = [];
  const on: Record<Mark, boolean> = { b: false, i: false, u: false };
  for (const t of toks) {
    if (t.mark) { on[t.mark] = !on[t.mark]; continue; }
    const last = out[out.length - 1];
    if (last && !!last.b === on.b && !!last.i === on.i && !!last.u === on.u) { last.text += t.text; continue; }
    out.push({ text: t.text, ...(on.b ? { b: true as const } : {}), ...(on.i ? { i: true as const } : {}), ...(on.u ? { u: true as const } : {}) });
  }
  return out;
}

export function parseAnnouncement(body: string): AnnouncementBlock[] {
  const blocks: AnnouncementBlock[] = [];
  let gap = false; /* vừa qua dòng trống: dòng sau bắt đầu khối mới */
  const level = (spaces: string) => Math.min(ANNOUNCEMENT_MAX_LEVEL, Math.floor(spaces.replace(/\t/g, "  ").length / 2));
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const last = blocks[blocks.length - 1];
    let m: RegExpMatchArray | null;
    if (!line.trim()) { gap = true; continue; }
    const fresh = gap; gap = false;
    if (/^\s*(-{3,}|_{3,})$/.test(line)) { blocks.push({ kind: "hr" }); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { blocks.push({ kind: "h", content: parseAnnouncementInline(m[1]!) }); continue; }
    if ((m = line.match(/^(\s*)(?:([-•*+])|(\d{1,3})[.)])\s+(.*)$/))) {
      const item = { ordered: !m[2], level: level(m[1]!), content: parseAnnouncementInline(m[4]!) };
      if (last?.kind === "list" && !fresh) last.items.push(item); else blocks.push({ kind: "list", items: [item] });
      continue;
    }
    m = line.match(/^\s*(>{1,3})\s?(.*)$/);
    const indent = m ? m[1]!.length : 0, text = m ? m[2]! : line.trim();
    if (last?.kind === "p" && last.indent === indent && !fresh) last.lines.push(parseAnnouncementInline(text));
    else blocks.push({ kind: "p", indent, lines: [parseAnnouncementInline(text)] });
  }
  return blocks;
}

/* Ký hiệu đầu mục: danh sách số đếm theo từng cấp (về 1 khi đổi loại hoặc sau mục cấp nông hơn), chấm đổi kiểu theo cấp */
export function announcementListMarkers(items: AnnouncementListItem[]): string[] {
  const count: number[] = [], kind: boolean[] = [];
  return items.map((it) => {
    count.length = kind.length = it.level + 1;
    if (kind[it.level] !== it.ordered) { count[it.level] = 0; kind[it.level] = it.ordered; }
    count[it.level] = (count[it.level] ?? 0) + 1;
    return it.ordered ? `${count[it.level]}.` : (["•", "◦", "▪", "▪"][it.level] ?? "•");
  });
}
/* Chữ thuần (bỏ ký hiệu) — dùng cho đoạn trích và ước tính thời gian đọc */
export function announcementPlainText(body: string): string {
  const flat = (c: AnnouncementInline[]) => c.map((x) => x.text).join("");
  return parseAnnouncement(body).map((b) => b.kind === "p" ? b.lines.map(flat).join("\n") : b.kind === "h" ? flat(b.content) : b.kind === "list" ? b.items.map((x) => flat(x.content)).join("\n") : "").filter(Boolean).join("\n\n");
}
/* Đoạn đầu tiên dạng chữ thuần (đoạn trích trên danh sách tin) */
export const announcementExcerpt = (body: string) => announcementPlainText(body).split("\n\n")[0] ?? "";
/* Thời gian đọc ước tính ("1 phút" như prototype): ~200 từ/phút, tối thiểu 1 */
export const announcementReadMinutes = (body: string) => Math.max(1, Math.round(announcementPlainText(body).split(/\s+/).filter(Boolean).length / 200));

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
/* Danh mục giấy tờ hồ sơ (công ty tự khai) + HR tích từng nhân viên. Không có trạng thái "giữ bản chính" (BLLĐ 2019 Điều 17). */
export type ChecklistItem = {
  id: string; name: string; required: boolean;
  /* null = áp dụng cho mọi tình trạng lao động */
  employmentTypes: EmploymentType[] | null;
  /* Mục đích thu thập (Luật Bảo vệ dữ liệu cá nhân 2025) */
  purpose: string | null; sortOrder: number; archived: boolean;
};
export type ChecklistItemList = { items: ChecklistItem[]; canManage: boolean };
export type ChecklistItemInput = { name: string; required: boolean; employmentTypes: EmploymentType[] | null; purpose?: string | null; sortOrder?: number };
/* copy: nộp bản sao · original_checked: đã đối chiếu bản chính (trả lại bản chính) */
export type ChecklistForm = "copy" | "original_checked";
export type ChecklistStatus = "submitted" | "waived";
export type ChecklistEntry = {
  item: ChecklistItem;
  /* Mục có áp dụng cho tình trạng lao động hiện tại của nhân viên */
  applies: boolean;
  status: ChecklistStatus | null; form: ChecklistForm | null; submittedOn: string | null; note: string | null; updatedAt: string | null;
};
export type EmployeeChecklist = { employeeId: string; employmentType: EmploymentType; entries: ChecklistEntry[]; missingRequired: number; canEdit: boolean };
/* status null = bỏ tích (chưa nộp) */
export type ChecklistEntryInput = { status: ChecklistStatus | null; form?: ChecklistForm | null; submittedOn?: string | null; note?: string | null };
/* Nhân viên đang làm trong phạm vi còn thiếu giấy tờ bắt buộc */
/* rows: chỉ người còn thiếu; required = số mục bắt buộc áp dụng cho người đó · requiredCount = số mục bắt buộc của danh mục */
export type ChecklistGaps = { rows: Array<{ employeeId: string; missing: string[]; required: number }>; itemCount: number; requiredCount: number };
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
  dailyLimitHours: number; offDayLimitHours: number; monthlyLimitHours: number; yearlyLimitHours: number; submitAfterDays: number;
};
export type OvertimeDay = {
  date: string; weekday: number; dayKind: OvertimeDayKind; holiday: string | null;
  /* Giờ ca chính (ngày thường) để không đăng ký trùng */
  shift: { name: string; start: string; end: string } | null;
  booked: Array<{ start: string; end: string; status: RequestStatus; no: string }>;
  /* Giờ vào/ra đã ghi nhận (hôm nay và ngày đã qua; null với ngày tới) — chỉ để đối chiếu, không bắt buộc */
  attendance: { clockIn: string | null; clockOut: string | null; adjusted: boolean } | null;
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
/* Lịch nghỉ theo tháng: mỗi dòng là một buổi/ngày nghỉ của một nhân viên (đơn đã duyệt hoặc đang chờ), trong phạm vi quyền xem phép */
export type LeaveMonthEntry = {
  date: string; employee: { id: string; code: string; fullName: string; department: string | null };
  half: LeaveHalf; portion: number; status: "approved" | "pending"; typeName: string; requestId: string; requestNo: string; reason: string | null;
};
export type LeaveMonth = { month: string; today: string; entries: LeaveMonthEntry[] };
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

/* Ô lưới ngày × người: off = ngày nghỉ/lễ, exp = đã có giải trình/điều chỉnh, fut = chưa tới/chưa có dữ liệu */
export type GridCell = "ok" | "late" | "miss" | "leave" | "exp" | "off" | "fut";
export type TimesheetRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  summary: TimesheetSummary;
  cells: Array<{ date: string; s: GridCell }>;
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
/* Danh sách đơn web HR: lọc + phân trang ở máy chủ. Ngày áp dụng: giải trình/OT = ngày công, nghỉ phép = từ–đến, tạm ứng = tháng khấu trừ,
   sửa hồ sơ = không có (lọc theo ngày gửi). status "closed" = từ chối + đã hủy. */
/* done = đã xử lý (duyệt + từ chối/hủy) */
export type RequestQueueStatus = "pending" | "approved" | "closed" | "done" | "all";
export type RequestQueueFilter = {
  status?: RequestQueueStatus; type?: RequestType; departmentId?: string; employeeId?: string;
  from?: string; to?: string; dateBy?: "applied" | "submitted"; only?: "mine" | "others" | "overdue"; q?: string; page?: number; pageSize?: number;
};
export type RequestQueueItem = RequestItem & { dueAt: string | null; overdue: boolean; applied: { from: string; to: string } | null };
export type RequestQueue = {
  items: RequestQueueItem[];
  /* Đếm theo bộ lọc hiện tại (trừ trạng thái) để hiện trên tab; mine/overdue trong các đơn đang chờ */
  counts: { pending: number; approved: number; closed: number; done: number; all: number; mine: number; overdue: number };
  total: number; page: number; pageSize: number;
};
/* daysOver: bước chỉ áp dụng khi đơn nghỉ dài hơn số ngày này (null/không có: luôn áp dụng) */
/* amountOver: bước chỉ áp dụng khi số tiền tạm ứng lớn hơn (₫) */
export type WorkflowStepInput = { resolver: StepResolver; slaHours: number; daysOver?: number | null; amountOver?: number | null };
export type WorkflowDef = {
  requestType: RequestType; name: string;
  current: { versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string } | null;
  versions: Array<{ versionNo: number; steps: WorkflowStepInput[]; effectiveFrom: string; note: string | null; createdAt: string }>;
};

/* ---------- Tham số luật tính lương (Kavor duy trì, phiên bản theo ngày) + bộ tính (docs/plans/payroll-calc.md) ---------- */
export type PayrollLawParams = {
  baseSalary: number; regionMinWage: Record<"1" | "2" | "3" | "4", number>;
  employee: { si: number; hi: number; ui: number }; employer: { si: number; hi: number; ui: number };
  capMultiplier: { siHi: number; ui: number }; deduction: { self: number; dependent: number };
  pit: Array<{ upTo: number | null; rate: number }>; casual: { rate: number; threshold: number };
  union: { employee: number; employeeCapOfBase: number; employer: number };
  /* Mức miễn thuế theo luật: tiền ăn giữa ca ₫/tháng */
  taxFree: { meal: number };
  /* full: tiền lương làm thêm giờ/làm đêm miễn thuế toàn bộ (Luật 109/2025) · premium: chỉ phần cao hơn giờ thường (luật cũ) */
  overtimeTaxFree: "full" | "premium";
};
export type PayrollLawVersion = {
  id: string; effectiveFrom: string; params: PayrollLawParams; sources: Array<{ item: string; ref: string; verified: boolean }>;
  note: string | null; state: "active" | "future" | "past"; editable: boolean;
};
export type PayCalcInput = {
  date: string; gross: number; taxFree?: number; insuranceSalary?: number | null; region: 1 | 2 | 3 | 4;
  dependents?: number; unionMember?: boolean; contract?: "labor" | "casual"; advance?: number;
  /* casual: có cam kết 08/CK-TNCN → không khấu trừ; yêu cầu khấu trừ → khấu trừ cả khi dưới ngưỡng */ commitment08?: boolean; withholdingRequested?: boolean;
  /* false = tháng không đóng BH (vd. không làm việc, không hưởng lương từ 14 ngày làm việc trở lên) — vẫn tính thuế lũy tiến */ insured?: boolean;
};
export type PayCalcLine = { key: string; label: string; amount: number; formula: string };
export type PayCalcResult = {
  lawFrom: string; unverified: string[];
  employee: PayCalcLine[]; employer: PayCalcLine[];
  totals: { gross: number; insurance: number; union: number; taxable: number; assessable: number; pit: number; advance: number; net: number; employerCost: number };
};

/* Kavor tính kỳ lương từ bảng lương đầu vào đã chốt (xem trước rồi ghi vào kỳ) */
export type PayrollComputeLine = { code: string; name: string; kind: "earning" | "deduction"; amount: number; formula: string };
export type PayrollComputeRow = {
  employee: { id: string; code: string; fullName: string; department: string | null };
  workDays: number; gross: number; deduction: number; net: number; lines: PayrollComputeLine[]; warnings: string[];
};
export type PayrollComputePreview = {
  month: string; sheetFinalizedAt: string; lawFrom: string; unverified: string[]; config: PayrollConfig;
  rows: PayrollComputeRow[]; skipped: Array<{ code: string; fullName: string; reason: string }>;
  totals: { employees: number; gross: number; deduction: number; net: number; employerCost: number };
};
