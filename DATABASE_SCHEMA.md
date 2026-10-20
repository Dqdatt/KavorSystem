# Kavor HRM — Database Schema Baseline

> Phiên bản: 1.0  
> Ngày: 20/10/2026  
> Database: PostgreSQL trên Supabase Managed  
> Mục tiêu: ERD logic và quy ước schema trước khi viết migration

## 1. Nguyên tắc

- Shared database, shared schema trong MVP.
- Mọi bảng nghiệp vụ thuộc doanh nghiệp phải có `tenant_id`.
- API resolve tenant từ token/membership; không tin `tenant_id` do client gửi.
- RLS là lớp bảo vệ bắt buộc, không thay thế kiểm tra quyền ở API.
- Dữ liệu có lịch sử không được update đè nếu cần truy vết.
- Tiền dùng `numeric`, không dùng floating point.
- Thời gian lưu `timestamptz`; ngày nghiệp vụ dùng `date` và timezone tenant.
- Dùng UUID/ULID cho khóa nội bộ; mã hiển thị là cột riêng.
- Các import và mutation quan trọng phải idempotent.
- Không hard delete hồ sơ nhân sự, payroll, workflow, attendance event và audit.

## 2. Cột chuẩn

Phần lớn bảng tenant-scoped có:

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `uuid` | Khóa chính |
| `tenant_id` | `uuid` | Ranh giới dữ liệu |
| `created_at` | `timestamptz` | Thời điểm tạo |
| `created_by` | `uuid null` | User thực hiện |
| `updated_at` | `timestamptz` | Thời điểm cập nhật |
| `updated_by` | `uuid null` | User cập nhật |
| `version` | `integer` | Optimistic locking khi cần |
| `deleted_at` | `timestamptz null` | Soft delete khi được phép |

Quy ước:

- Unique key theo doanh nghiệp phải chứa `tenant_id`.
- Mã hiển thị dùng `text`, ví dụ `employee_code`, `request_no`.
- Dữ liệu mở rộng có thể dùng `jsonb`, nhưng trường cần filter/report phải là column chuẩn.
- Enum ổn định có thể dùng PostgreSQL enum; trạng thái cần mở rộng dùng lookup/check constraint.

## 3. Sơ đồ domain

```text
tenant
 ├─ memberships ─ users ─ device_installations
 ├─ legal_entities ─ branches ─ work_locations
 ├─ departments ─ teams ─ positions
 ├─ employees ─ assignments ─ contracts
 │    ├─ attendance_events ─ timesheets ─ adjustments
 │    ├─ leave_accounts ─ leave_transactions
 │    ├─ requests ─ workflow_instances ─ approval_tasks
 │    ├─ payroll_results ─ payslips
 │    └─ employee_documents
 ├─ payroll_configs ─ payroll_config_versions ─ payroll_cycles
 ├─ integration_connections ─ sync_jobs ─ staging/raw snapshots
 └─ roles ─ permissions ─ role_assignments ─ audit_logs
```

## 4. Platform và tenant

### `tenants`

- `id uuid pk`
- `code text unique`
- `display_name text`
- `legal_name text null`
- `tax_code text null`
- `status text` — `provisioning|active|suspended|closed`
- `plan_code text`
- `primary_region text`
- `timezone text`
- `currency char(3)`
- `locale text`
- `employee_limit integer`
- `created_at`, `updated_at`

`tenants` là thực thể Kavor, không phải hồ sơ đăng ký kinh doanh.

### `tenant_settings`

- `tenant_id uuid pk fk tenants`
- `branding jsonb`
- `attendance_settings jsonb`
- `notification_settings jsonb`
- `data_retention_settings jsonb`
- `mobile_policy jsonb`
- `updated_at`, `updated_by`

### `subscriptions`

- `id`, `tenant_id`
- `plan_code`
- `status`
- `starts_at`, `ends_at`
- `seat_limit`
- `features jsonb`

### `tenant_usage_daily`

- `tenant_id`, `usage_date`
- `active_users`, `employee_count`
- `storage_bytes`, `api_requests`, `sync_rows`
- Unique: `(tenant_id, usage_date)`

## 5. Identity và phân quyền

### `users`

- `id uuid pk` — liên kết identity provider
- `email citext null`
- `phone text null`
- `status text`
- `last_login_at timestamptz null`

`users` là global identity; dữ liệu tenant nằm trong membership/employee.

### `memberships`

- `id`, `tenant_id`, `user_id`
- `employee_id uuid null`
- `status text`
- `joined_at`, `ended_at`
- Unique active: `(tenant_id, user_id)`

### `roles`

- `id`, `tenant_id null`
- `code`, `name`, `is_system`
- `tenant_id null` biểu thị role template của hệ thống.

### `permissions`

- `id`, `code unique`, `module`, `description`

### `role_permissions`

- `role_id`, `permission_id`
- Primary key: `(role_id, permission_id)`

### `role_assignments`

- `id`, `tenant_id`, `membership_id`, `role_id`
- `scope_type` — `tenant|legal_entity|branch|department|team|self`
- `scope_id uuid null`
- `effective_from`, `effective_to`

### `device_installations`

- `id`, `tenant_id`, `user_id`
- `platform` — `ios|android|web`
- `installation_id text`
- `push_token_ciphertext text null`
- `app_version`, `os_version`, `device_model`
- `status`, `last_seen_at`, `revoked_at`
- Unique: `(platform, installation_id)`

Không lưu biometric template; ứng dụng chỉ nhận kết quả xác thực của hệ điều hành.

## 6. Tổ chức

### `legal_entities`

- `id`, `tenant_id`, `code`, `name`
- `tax_code`, `address jsonb`
- `effective_from`, `effective_to`

### `branches`

- `id`, `tenant_id`, `legal_entity_id`
- `code`, `name`, `timezone`
- `effective_from`, `effective_to`

### `work_locations`

- `id`, `tenant_id`, `branch_id`
- `name`, `address`
- `latitude numeric(9,6)`, `longitude numeric(9,6)`
- `geofence_radius_m integer`
- `attendance_methods text[]`

### `departments`, `teams`, `positions`, `job_levels`, `cost_centers`

Các bảng có `code`, `name`, `parent_id` khi có phân cấp, `effective_from`, `effective_to` và unique `(tenant_id, code)`.

## 7. Nhân sự

### `employees`

- `id`, `tenant_id`
- `employee_code text`
- `user_id uuid null`
- `full_name text`
- `preferred_name text null`
- `date_of_birth date null`
- `gender text null`
- `work_email citext null`, `personal_email citext null`
- `phone text null`
- `hire_date date`, `termination_date date null`
- `status text`
- `manager_employee_id uuid null`
- `source_system text`
- `external_id text null`
- Unique: `(tenant_id, employee_code)`
- Unique có điều kiện: `(tenant_id, source_system, external_id)` khi `external_id` khác null

PII nhạy cảm cần column-level access hoặc bảng tách riêng.

### `employee_private_profiles`

- `employee_id uuid pk`
- `tenant_id`
- `national_id_ciphertext text null`
- `tax_code_ciphertext text null`
- `social_insurance_ciphertext text null`
- `address_ciphertext text null`

### `employee_bank_accounts`

- `id`, `tenant_id`, `employee_id`
- `bank_code`, `account_name`
- `account_number_ciphertext`
- `is_primary`, `effective_from`, `effective_to`

### `employee_assignments`

- `id`, `tenant_id`, `employee_id`
- `legal_entity_id`, `branch_id`, `department_id`, `team_id`
- `position_id`, `job_level_id`, `cost_center_id`
- `manager_employee_id`
- `effective_from`, `effective_to`
- Không để hai assignment chính chồng thời gian nếu policy không cho phép.

### `employment_contracts`

- `id`, `tenant_id`, `employee_id`
- `contract_no`, `contract_type`
- `starts_on`, `ends_on`
- `status`
- `document_version_id uuid null`

### `employment_status_history`

- `id`, `tenant_id`, `employee_id`
- `status`, `effective_from`, `effective_to`, `reason`

### Custom fields

- `employee_custom_fields(id, tenant_id, code, label, data_type, validation, is_sensitive)`
- `employee_custom_values(id, tenant_id, employee_id, field_id, value_jsonb, effective_from, effective_to)`

## 8. Ca làm và chấm công

### `shift_definitions`

- `id`, `tenant_id`, `code`, `name`
- `start_local_time`, `end_local_time`
- `crosses_midnight boolean`
- `break_rules jsonb`, `grace_rules jsonb`
- `effective_from`, `effective_to`

### `work_schedules`

- `id`, `tenant_id`, `name`, `timezone`
- `effective_from`, `effective_to`

### `shift_assignments`

- `id`, `tenant_id`, `employee_id`
- `work_date`, `shift_definition_id`, `work_location_id`
- Unique: `(tenant_id, employee_id, work_date, shift_definition_id)`

### `attendance_events`

- `id`, `tenant_id`, `employee_id`
- `event_type` — `check_in|check_out|break_start|break_end`
- `occurred_at timestamptz`
- `received_at timestamptz`
- `source` — `ios|android|web|device|import`
- `device_installation_id uuid null`
- `latitude`, `longitude`, `accuracy_m`
- `offline_created_at timestamptz null`
- `idempotency_key text`
- `raw_payload jsonb`
- Unique: `(tenant_id, idempotency_key)`

Không update/delete event gốc trong luồng bình thường.

### `attendance_event_verifications`

- `attendance_event_id uuid pk`
- `tenant_id`
- `geofence_result`, `device_result`, `time_result`
- `risk_flags jsonb`
- `verified_at`

### `daily_timesheets`, `monthly_timesheets`

- Snapshot tổng hợp, có `status`, `calculation_version`, `calculated_at`.
- Monthly unique: `(tenant_id, employee_id, period_start, period_end)`.

### `attendance_exceptions`

- `id`, `tenant_id`, `employee_id`, `work_date`
- `type`, `severity`, `status`, `source_record_id`

### `attendance_adjustments`

- `id`, `tenant_id`, `employee_id`, `work_date`
- `request_id uuid null`
- `before_value jsonb`, `after_value jsonb`, `reason`
- `approved_by`, `approved_at`

### `timesheet_locks`

- `id`, `tenant_id`, `period_start`, `period_end`
- `scope_type`, `scope_id`
- `locked_by`, `locked_at`, `reason`

## 9. Nghỉ phép

### `leave_types`, `leave_policies`, `leave_policy_assignments`

- Chính sách có version/ngày hiệu lực.
- Assignment có thể theo tenant, nhóm hoặc nhân viên.

### `leave_accounts`

- `id`, `tenant_id`, `employee_id`, `leave_type_id`, `period_year`
- Không dùng `balance` làm nguồn lịch sử duy nhất.

### `leave_transactions`

- `id`, `tenant_id`, `leave_account_id`
- `transaction_type` — `grant|accrual|hold|release|consume|adjust|expire`
- `amount numeric(8,2)`
- `effective_on`, `request_id`, `reason`
- Số dư là tổng giao dịch hợp lệ.

### `leave_requests`

- `id`, `tenant_id`, `request_id unique`
- `employee_id`, `leave_type_id`
- `starts_at`, `ends_at`, `duration`
- `reason`, `handover_employee_id`

## 10. Request và workflow

### `requests`

- `id`, `tenant_id`, `request_no`
- `request_type`, `requester_employee_id`
- `status`, `submitted_at`, `completed_at`
- `current_version integer`
- Unique: `(tenant_id, request_no)`

### `request_versions`

- `id`, `tenant_id`, `request_id`, `version_no`
- `payload jsonb`, `policy_snapshot jsonb`
- Unique: `(request_id, version_no)`

### `workflow_definitions`, `workflow_versions`, `workflow_steps`

- Definition theo tenant và request type.
- Version lưu điều kiện, thứ tự, approver resolver, SLA và escalation.

### `workflow_instances`

- `id`, `tenant_id`, `request_id`, `workflow_version_id`
- `status`, `started_at`, `completed_at`

### `approval_tasks`

- `id`, `tenant_id`, `workflow_instance_id`, `step_id`
- `assignee_membership_id`, `status`, `due_at`
- `claimed_at`, `completed_at`

### `approval_actions`

- `id`, `tenant_id`, `approval_task_id`
- `action`, `comment`, `acted_by`, `acted_at`
- Append-only.

## 11. Payroll

### `payroll_configs`

- `id`, `tenant_id`, `code`, `name`, `mode`
- `mode` — `final_result_import|input_export|kavor_calculation`

### `payroll_config_versions`

- `id`, `tenant_id`, `payroll_config_id`, `version_no`
- `effective_from`, `effective_to`
- `period_rule jsonb`, `rounding_rule jsonb`, `approval_rule jsonb`
- `status` — `draft|active|retired`
- Unique: `(payroll_config_id, version_no)`

### `pay_components`

- `id`, `tenant_id`, `code`, `name`
- `component_type` — `earning|deduction|employer_cost|net`
- `is_sensitive`, `display_order`
- Unique: `(tenant_id, code)`

### `pay_component_rules`

- `id`, `tenant_id`, `config_version_id`, `component_id`
- `source_type`, `formula_jsonb`, `condition_jsonb`, `rounding_rule`

MVP chủ yếu lưu mapping/import rule; calculation rule nâng cao để sau pilot.

### `payroll_cycles`

- `id`, `tenant_id`, `config_version_id`
- `cycle_code`, `period_start`, `period_end`, `pay_date`
- `status` — `open|prepared|under_review|approved|published|paid|closed`
- `locked_at`, `locked_by`
- Unique: `(tenant_id, cycle_code)`

### `payroll_import_batches`

- `id`, `tenant_id`, `payroll_cycle_id`, `sync_job_id`
- `source`, `mapping_version_id`, `status`
- `total_rows`, `success_rows`, `error_rows`

### `payroll_inputs`

- `id`, `tenant_id`, `payroll_cycle_id`, `employee_id`, `component_id`
- `quantity`, `rate`, `amount`, `source_type`, `source_id`

### `payroll_results`

- `id`, `tenant_id`, `payroll_cycle_id`, `employee_id`
- `gross_amount`, `deduction_amount`, `net_amount`, `currency`
- Unique: `(tenant_id, payroll_cycle_id, employee_id)`

### `payroll_result_items`

- `id`, `tenant_id`, `payroll_result_id`, `component_id`
- `amount`, `quantity`, `display_label`

### `payslips`

- `id`, `tenant_id`, `payroll_result_id`, `employee_id`
- `document_version_id`, `published_at`, `published_by`
- `viewed_at`, `revoked_at`

### `salary_advances`, `salary_advance_events`

- Advance liên kết `request_id`, số tiền, kỳ khấu trừ và trạng thái.
- Event append-only: requested, approved, paid, deducted, cancelled.

## 12. Tài liệu và truyền thông

### `documents`, `document_versions`, `employee_documents`

- Metadata nằm trong DB; binary nằm trong object storage.
- Version chứa `storage_key`, checksum, MIME type, size và scan status.
- Không lưu public URL cố định; tạo signed URL ngắn hạn.

### `announcements`, `announcement_audiences`, `announcement_reads`

- Audience theo tenant/org scope.
- Read record unique `(announcement_id, employee_id)`.

### `notifications`, `notification_deliveries`

- Notification là intent; delivery tách theo `in_app|apns|fcm|email`.
- Unique deduplication key để chống gửi trùng.

## 13. Integration và Google Sheets

### `integration_connections`

- `id`, `tenant_id`, `provider`, `status`
- `display_name`, `scopes text[]`
- `credential_reference` — tham chiếu secret vault, không lưu token thô
- `created_by`, `revoked_at`

### `google_sheet_sources`

- `id`, `tenant_id`, `connection_id`
- `spreadsheet_id`, `sheet_tab_id`, `sheet_title`
- `dataset_type`, `direction`, `source_of_truth`

### `mapping_templates`, `mapping_template_versions`

- Lưu mapping field, transformer, default và validation rule.

### `sync_jobs`

- `id`, `tenant_id`, `connection_id`, `dataset_type`
- `trigger_type`, `status`, `idempotency_key`
- `started_at`, `finished_at`, `attempt_count`
- `total_rows`, `success_rows`, `error_rows`, `conflict_rows`

### `raw_import_snapshots`

- `id`, `tenant_id`, `sync_job_id`
- `storage_key`, `checksum`, `captured_at`
- Immutable theo retention policy.

### `sync_job_rows`

- `id`, `tenant_id`, `sync_job_id`, `source_row_no`
- `external_key`, `source_hash`, `status`
- `normalized_payload jsonb`, `errors jsonb`

### `sync_conflicts`

- `id`, `tenant_id`, `sync_job_row_id`
- `field_name`, `source_value`, `kavor_value`
- `resolution`, `resolved_by`, `resolved_at`

## 14. Audit và reliability

### `audit_logs`

- `id uuid`, `tenant_id uuid null`
- `actor_user_id`, `actor_membership_id`
- `actor_type` — `user|support|system|job`
- `action`, `resource_type`, `resource_id`
- `before_jsonb`, `after_jsonb`
- `reason`, `ip_hash`, `device_id`, `correlation_id`
- `created_at`
- Append-only; quyền đọc tách khỏi quyền vận hành.

### `support_access_sessions`

- `id`, `tenant_id`, `operator_user_id`
- `reason`, `approved_by`
- `scopes text[]`, `starts_at`, `expires_at`, `revoked_at`

### `idempotency_keys`

- `tenant_id`, `key`, `operation`
- `request_hash`, `response_reference`, `expires_at`
- Unique: `(tenant_id, operation, key)`

### `outbox_events`

- `id`, `tenant_id`, `event_type`, `aggregate_type`, `aggregate_id`
- `payload`, `occurred_at`, `published_at`, `attempt_count`

## 15. RLS baseline

Mọi policy tenant-scoped phải dựa trên tenant context được backend ký/xác nhận.

Pseudo-policy:

```sql
tenant_id = current_setting('app.current_tenant_id')::uuid
```

Điều kiện bổ sung:

- Employee: `employee_id = current_employee_id()`.
- Manager: resource nằm trong materialized management scope.
- HR branch: branch thuộc scope assignment.
- Payroll: có permission payroll tương ứng.
- Support: có `support_access_session` hợp lệ, chưa hết hạn và đúng scope.

Không cấp service-role key cho frontend/mobile.

## 16. Index bắt buộc ban đầu

- Tất cả foreign key thường xuyên join.
- `(tenant_id, employee_code)`.
- `(tenant_id, user_id)` trên memberships.
- `(tenant_id, employee_id, occurred_at desc)` trên attendance events.
- `(tenant_id, status, created_at desc)` trên requests/tasks/jobs.
- `(tenant_id, payroll_cycle_id, employee_id)` trên payroll.
- `(tenant_id, resource_type, resource_id, created_at desc)` trên audit.
- GIN cho JSONB chỉ khi có truy vấn thực tế và đo được lợi ích.

## 17. Partition và retention

Chưa partition sớm tất cả bảng. Theo dõi volume và ưu tiên partition theo thời gian cho:

- `attendance_events`.
- `audit_logs`.
- `notification_deliveries`.
- `sync_job_rows`.

Retention phải cấu hình theo loại dữ liệu và hợp đồng tenant. Không xóa audit/payroll chỉ vì người dùng bị vô hiệu hóa.

## 18. Thứ tự migration

1. Extensions, enum/check types và helper functions.
2. Tenant, identity, membership, role và permission.
3. Organization và employee.
4. Audit, outbox và idempotency.
5. Attendance, leave và workflow.
6. Payroll.
7. Documents/communications.
8. Integration/staging.
9. RLS policies và isolation tests.
10. Seed system roles/permissions, không seed dữ liệu production.

## 19. Kiểm thử schema bắt buộc

- Cross-tenant read/write/delete bị từ chối.
- Unique constraint hoạt động độc lập theo tenant.
- Import cùng idempotency key không ghi trùng.
- Attendance event không bị update/delete qua API thường.
- Leave balance khớp tổng ledger.
- Payroll cycle đóng ngăn mutation trực tiếp.
- Support session hết hạn mất quyền ngay.
- Signed URL tài liệu hết hạn và không dùng chéo tenant.
- Restore backup giữ nguyên constraint, policy và audit.
