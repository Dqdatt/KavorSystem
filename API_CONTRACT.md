# Kavor HRM — API Contract Baseline

> Style: REST/JSON + OpenAPI 3.1  
> Base path: `/api/v1`  
> Trạng thái: Baseline cho thiết kế; OpenAPI machine-readable sẽ được sinh trong Sprint 1–2

## 1. Quy ước chung

### Headers

- `Authorization: Bearer <access-token>`
- `X-Correlation-Id: <uuid>` — client có thể gửi, server luôn trả lại.
- `Idempotency-Key: <uuid>` — bắt buộc với attendance, import confirmation và mutation nhạy cảm.
- `If-Match: <version>` — dùng cho optimistic locking khi endpoint yêu cầu.

Client không gửi `tenant_id` để quyết định scope. API resolve tenant từ session/membership hoặc platform support context hợp lệ.

### Response envelope

```json
{
  "data": {},
  "meta": { "correlationId": "..." },
  "error": null
}
```

### Error

```json
{
  "data": null,
  "meta": { "correlationId": "..." },
  "error": {
    "code": "EMPLOYEE_CODE_DUPLICATE",
    "message": "Mã nhân viên đã tồn tại.",
    "fields": [{ "field": "employeeCode", "code": "duplicate" }],
    "retryable": false
  }
}
```

HTTP status chuẩn: `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`.

### Pagination

Cursor-based:

```json
{ "limit": 50, "nextCursor": "opaque-token" }
```

### Date/time

- Instant: ISO 8601 UTC, ví dụ `2026-10-20T01:30:00Z`.
- Ngày nghiệp vụ: `YYYY-MM-DD`.
- API trả timezone tenant khi hiển thị theo giờ địa phương.

## 2. Identity và session

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| POST | `/auth/activate/start` | Public | `{employeeCode, email}` khớp hồ sơ HR → gửi OTP 6 số qua email (hiệu lực 5 phút) |
| POST | `/auth/activate/verify` | Public + OTP | `{email, code, password}` → gắn tài khoản với hồ sơ nhân viên, trả `{session, me}` |
| POST | `/auth/login` | Public | `{identifier (mã NV hoặc email), password}` → `{session, me}` |
| POST | `/auth/password/forgot` | Public | `{identifier}` → gửi OTP đặt lại mật khẩu |
| POST | `/auth/password/reset` | Public + OTP | `{email, code, newPassword}` → `{session, me}` |
| POST | `/auth/refresh` | Refresh token | `{refreshToken}` → `{session, me}` |
| POST | `/auth/logout` | Session | Thu hồi session hiện tại |
| GET | `/me` | Authenticated | Nhân viên, công ty hiện tại |

Lỗi auth trả mã ổn định trong `error.code` (`AUTH_INVALID_CREDENTIALS`, `AUTH_NOT_ACTIVATED`, `AUTH_ALREADY_ACTIVATED`, `AUTH_EMPLOYEE_NOT_FOUND`, `AUTH_OTP_INVALID`, `AUTH_WEAK_PASSWORD`, `AUTH_RATE_LIMITED`, `AUTH_SESSION_EXPIRED`) — xem `AUTH_ERRORS` trong `@kavor/contracts`. Mật khẩu: ≥ 8 ký tự, có chữ, số, chữ hoa, không chứa mã nhân viên. Sai 5 lần trong 5 phút (đăng nhập) hoặc 15 phút (OTP) thì tạm khóa theo IP + định danh.
| GET | `/me/permissions` | Authenticated | Permission hiệu lực |
| POST | `/me/devices` | Authenticated | Đăng ký iOS/Android installation |
| DELETE | `/me/devices/{id}` | Owner/Admin | Thu hồi thiết bị |

Ví dụ đăng ký thiết bị:

```json
{
  "platform": "ios",
  "installationId": "install-uuid",
  "pushToken": "opaque-device-token",
  "appVersion": "1.0.0",
  "osVersion": "18.0",
  "deviceModel": "iPhone"
}
```

## 3. Tenant và organization

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/platform/tenants` | `platform.tenant.manage` |
| GET | `/platform/tenants` | `platform.tenant.manage` |
| PATCH | `/platform/tenants/{id}/status` | `platform.tenant.manage` |
| GET | `/tenant/settings` | `tenant.read` |
| PATCH | `/tenant/settings` | `tenant.settings.manage` |
| GET/POST | `/organization/legal-entities` | `organization.read/manage` |
| GET/POST | `/organization/branches` | `organization.read/manage` |
| GET/POST | `/organization/departments` | `organization.read/manage` |
| GET/POST | `/organization/positions` | `organization.read/manage` |

Mọi mutation organization dùng `effectiveFrom`; entity đang được tham chiếu không hard delete.

## 4. Employee

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/employees` | `employee.read` |
| POST | `/employees` | `employee.create` |
| GET | `/employees/{id}` | `employee.read` hoặc self |
| PATCH | `/employees/{id}` | `employee.update` |
| POST | `/employees/{id}/assignments` | `employee.update` |
| POST | `/employees/{id}/terminate` | `employee.terminate` |
| GET | `/me/employee-profile` | `employee.self.read` |
| POST | `/me/profile-change-requests` | `employee.self.change_request` |

Query `/employees`: `search`, `status`, `branchId`, `departmentId`, `managerId`, `cursor`, `limit`.

Field nhạy cảm chỉ được serialize khi permission tương ứng hợp lệ.

## 5. Import và Google Sheets

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/integrations/google/authorize` | `integration.connect` |
| GET | `/integrations/google/callback` | OAuth state |
| GET | `/integrations/google/sources` | `integration.read` |
| POST | `/imports` | `integration.sync` |
| POST | `/imports/{id}/upload` | `integration.sync` |
| PUT | `/imports/{id}/mapping` | `integration.sync` |
| POST | `/imports/{id}/validate` | `integration.sync` |
| GET | `/imports/{id}/preview` | `integration.read` |
| POST | `/imports/{id}/confirm` | `integration.sync` |
| POST | `/sync-jobs/{id}/retry` | `integration.sync` hoặc platform retry |
| GET | `/sync-jobs/{id}` | `integration.read` |

Trạng thái import:

```text
draft → uploaded → mapping_ready → validating
      → needs_review → confirmed → applying → completed
      └──────────────────────────────→ failed
```

`confirm` bắt buộc `Idempotency-Key` và checksum của preview để tránh xác nhận dữ liệu đã thay đổi.

## 6. Shift và schedule

| Method | Endpoint | Permission |
|---|---|---|
| GET/POST | `/shifts` | `schedule.read/manage` |
| GET/POST | `/schedules` | `schedule.read/manage` |
| POST | `/schedules/{id}/assignments` | `schedule.manage` |
| GET | `/me/schedule` | `schedule.read` self |

## 7. Attendance

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/attendance/events` | `attendance.self.clock` |
| GET | `/me/attendance/events` | `attendance.self.read` |
| GET | `/me/timesheets` | `attendance.self.read` |
| GET | `/attendance/events` | `attendance.read` |
| GET | `/timesheets` | `attendance.read` |
| POST | `/attendance/adjustments` | `attendance.adjust` |
| POST | `/timesheet-locks` | `timesheet.lock` |
| POST | `/timesheet-locks/{id}/unlock` | `timesheet.unlock` |

Request chấm công:

```json
{
  "eventType": "check_in",
  "occurredAt": "2026-10-20T01:28:12Z",
  "offlineCreatedAt": null,
  "location": {
    "latitude": 10.7769,
    "longitude": 106.7009,
    "accuracyM": 18.4
  },
  "deviceInstallationId": "uuid",
  "clientEventId": "uuid"
}
```

Response phân biệt `accepted`, `needs_review`, `duplicate` và `rejected`. Retry cùng key trả kết quả trước đó.

## 8. Leave, OT và request

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/me/leave-balances` | `leave.self.read` |
| GET | `/leave/accounts` | `leave.read` |
| POST | `/leave/adjustments` | `leave.adjust_balance` |
| POST | `/requests` | `request.self.create` |
| GET | `/requests` | `request.self.read` hoặc `request.read` |
| GET | `/requests/{id}` | Theo owner/scope |
| POST | `/requests/{id}/submit` | Owner |
| POST | `/requests/{id}/cancel` | Owner + state hợp lệ |
| GET | `/approval-tasks` | `request.approve` |
| POST | `/approval-tasks/{id}/actions` | Assignee + `request.approve` |

Action body:

```json
{ "action": "approve", "comment": "Đồng ý" }
```

Server kiểm tra assignee, state transition, scope và self-approval policy trong cùng transaction.

## 9. Payroll

| Method | Endpoint | Permission |
|---|---|---|
| GET/POST | `/payroll/configs` | `payroll.read/config.manage` |
| POST | `/payroll/configs/{id}/versions` | `payroll.config.manage` |
| GET/POST | `/payroll/cycles` | `payroll.read/import` |
| POST | `/payroll/cycles/{id}/imports` | `payroll.import` |
| GET | `/payroll/cycles/{id}/validation` | `payroll.read` |
| POST | `/payroll/cycles/{id}/transitions` | Theo transition permission |
| GET | `/payroll/cycles/{id}/results` | `payroll.read` |
| POST | `/payroll/cycles/{id}/publish` | `payroll.publish` |
| POST | `/payroll/cycles/{id}/reopen` | `payroll.cycle.reopen` |
| POST | `/me/payslips/{id}/reauth` | Owner |
| GET | `/me/payslips` | `payroll.self.read` |
| GET | `/me/payslips/{id}/download-url` | Owner + recent reauth |

Transition body:

```json
{
  "to": "under_review",
  "reason": "Đã xử lý toàn bộ lỗi blocker",
  "expectedVersion": 4
}
```

## 10. Documents và announcement

| Method | Endpoint | Permission |
|---|---|---|
| POST | `/documents/upload-intents` | `document.upload` |
| POST | `/documents` | `document.manage` |
| POST | `/documents/{id}/versions` | `document.manage` |
| GET | `/documents/{id}/download-url` | `document.read` |
| GET | `/me/documents` | `document.self.read` |
| GET/POST | `/announcements` | `announcement.read/publish` |
| POST | `/announcements/{id}/read` | Audience member |
| GET | `/me/notifications` | Authenticated |
| POST | `/me/notifications/{id}/read` | Owner |

## 11. Kavor Console

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/platform/usage` | `platform.usage.read` |
| GET/POST | `/platform/incidents` | `platform.incident.manage` |
| GET/POST | `/platform/feature-flags` | `platform.feature_flag.manage` |
| GET/POST | `/platform/releases` | `platform.release.manage` |
| POST | `/platform/support-sessions` | `platform.support.request` |
| POST | `/platform/support-sessions/{id}/approve` | `platform.support.approve` |
| POST | `/platform/support-sessions/{id}/revoke` | Approver/operator |
| GET | `/platform/audit` | `platform.audit.read` |

## 12. Async jobs và webhook nội bộ

Long-running operation trả `202 Accepted`:

```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "statusUrl": "/api/v1/jobs/uuid"
  },
  "meta": { "correlationId": "uuid" },
  "error": null
}
```

Job states: `queued|running|needs_review|succeeded|failed|cancelled`.

Domain event nội bộ dùng outbox, ví dụ:

- `employee.created`
- `attendance.event.accepted`
- `timesheet.locked`
- `request.submitted`
- `approval.completed`
- `payroll.published`
- `document.expiring`

## 13. Rate limit và retry

- Login/OTP: giới hạn theo IP, identity và device.
- Attendance: giới hạn nhưng phải trả idempotent result cho retry hợp lệ.
- Import: giới hạn concurrent job theo tenant/gói.
- `429` trả `Retry-After`.
- Client chỉ retry tự động với operation idempotent hoặc có idempotency key.

## 14. API security checklist

- Authorization kiểm tra resource + action + scope.
- Không bind trực tiếp DTO vào model database.
- Field-level serialization cho payroll/PII.
- File download qua signed URL ngắn hạn.
- Request size/file type/checksum/virus scan.
- Audit cho export, payroll, role, support và sensitive reads.
- Không trả stack trace/token/secret cho client.
- OpenAPI test bảo đảm iOS, Android và web dùng cùng contract.
