# Kavor HRM — ERD cấp cao

> Phiên bản: 1.0  
> Phạm vi: MVP multi-tenant  
> Chi tiết cột và constraint: xem `DATABASE_SCHEMA.md`

## 1. Tenant, identity và organization

```mermaid
erDiagram
    TENANTS ||--|| TENANT_SETTINGS : has
    TENANTS ||--o{ SUBSCRIPTIONS : uses
    TENANTS ||--o{ MEMBERSHIPS : contains
    USERS ||--o{ MEMBERSHIPS : joins
    MEMBERSHIPS ||--o{ ROLE_ASSIGNMENTS : receives
    ROLES ||--o{ ROLE_ASSIGNMENTS : assigned
    ROLES ||--o{ ROLE_PERMISSIONS : contains
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : grants
    USERS ||--o{ DEVICE_INSTALLATIONS : registers

    TENANTS ||--o{ LEGAL_ENTITIES : owns
    LEGAL_ENTITIES ||--o{ BRANCHES : has
    BRANCHES ||--o{ WORK_LOCATIONS : has
    TENANTS ||--o{ DEPARTMENTS : has
    DEPARTMENTS ||--o{ TEAMS : has
    TENANTS ||--o{ POSITIONS : has
```

## 2. Employee master

```mermaid
erDiagram
    TENANTS ||--o{ EMPLOYEES : employs
    USERS o|--o| EMPLOYEES : linked_identity
    EMPLOYEES ||--o{ EMPLOYEE_ASSIGNMENTS : has_history
    EMPLOYEES ||--o{ EMPLOYMENT_STATUS_HISTORY : has
    EMPLOYEES ||--o{ EMPLOYMENT_CONTRACTS : signs
    EMPLOYEES ||--o{ EMPLOYEE_BANK_ACCOUNTS : owns
    EMPLOYEES ||--o| EMPLOYEE_PRIVATE_PROFILES : has

    LEGAL_ENTITIES ||--o{ EMPLOYEE_ASSIGNMENTS : scopes
    BRANCHES ||--o{ EMPLOYEE_ASSIGNMENTS : scopes
    DEPARTMENTS ||--o{ EMPLOYEE_ASSIGNMENTS : scopes
    TEAMS ||--o{ EMPLOYEE_ASSIGNMENTS : scopes
    POSITIONS ||--o{ EMPLOYEE_ASSIGNMENTS : scopes
    EMPLOYEES o|--o{ EMPLOYEE_ASSIGNMENTS : manages
```

## 3. Attendance

```mermaid
erDiagram
    EMPLOYEES ||--o{ SHIFT_ASSIGNMENTS : scheduled
    SHIFT_DEFINITIONS ||--o{ SHIFT_ASSIGNMENTS : defines
    WORK_LOCATIONS ||--o{ SHIFT_ASSIGNMENTS : located_at

    EMPLOYEES ||--o{ ATTENDANCE_EVENTS : creates
    DEVICE_INSTALLATIONS ||--o{ ATTENDANCE_EVENTS : sends
    ATTENDANCE_EVENTS ||--|| ATTENDANCE_EVENT_VERIFICATIONS : verified_by
    EMPLOYEES ||--o{ DAILY_TIMESHEETS : receives
    DAILY_TIMESHEETS ||--o{ ATTENDANCE_EXCEPTIONS : contains
    EMPLOYEES ||--o{ ATTENDANCE_ADJUSTMENTS : receives
    REQUESTS o|--o{ ATTENDANCE_ADJUSTMENTS : authorizes
    EMPLOYEES ||--o{ MONTHLY_TIMESHEETS : receives
    TIMESHEET_LOCKS }o--|| TENANTS : belongs_to
```

## 4. Leave và workflow

```mermaid
erDiagram
    LEAVE_TYPES ||--o{ LEAVE_POLICIES : configured_by
    LEAVE_POLICIES ||--o{ LEAVE_POLICY_ASSIGNMENTS : assigned
    EMPLOYEES ||--o{ LEAVE_ACCOUNTS : owns
    LEAVE_TYPES ||--o{ LEAVE_ACCOUNTS : categorized
    LEAVE_ACCOUNTS ||--o{ LEAVE_TRANSACTIONS : records

    EMPLOYEES ||--o{ REQUESTS : submits
    REQUESTS ||--o{ REQUEST_VERSIONS : snapshots
    REQUESTS ||--o| LEAVE_REQUESTS : details
    REQUESTS ||--|| WORKFLOW_INSTANCES : starts
    WORKFLOW_DEFINITIONS ||--o{ WORKFLOW_VERSIONS : versions
    WORKFLOW_VERSIONS ||--o{ WORKFLOW_STEPS : contains
    WORKFLOW_VERSIONS ||--o{ WORKFLOW_INSTANCES : executes
    WORKFLOW_INSTANCES ||--o{ APPROVAL_TASKS : creates
    APPROVAL_TASKS ||--o{ APPROVAL_ACTIONS : logs
    MEMBERSHIPS ||--o{ APPROVAL_TASKS : assigned
```

## 5. Payroll

```mermaid
erDiagram
    TENANTS ||--o{ PAYROLL_CONFIGS : configures
    PAYROLL_CONFIGS ||--o{ PAYROLL_CONFIG_VERSIONS : versions
    PAYROLL_CONFIG_VERSIONS ||--o{ PAY_COMPONENT_RULES : defines
    PAY_COMPONENTS ||--o{ PAY_COMPONENT_RULES : calculated_by
    PAYROLL_CONFIG_VERSIONS ||--o{ PAYROLL_CYCLES : snapshots
    PAYROLL_CYCLES ||--o{ PAYROLL_IMPORT_BATCHES : imports
    PAYROLL_CYCLES ||--o{ PAYROLL_INPUTS : contains
    PAYROLL_CYCLES ||--o{ PAYROLL_RESULTS : produces
    EMPLOYEES ||--o{ PAYROLL_INPUTS : receives
    EMPLOYEES ||--o{ PAYROLL_RESULTS : receives
    PAYROLL_RESULTS ||--o{ PAYROLL_RESULT_ITEMS : details
    PAY_COMPONENTS ||--o{ PAYROLL_RESULT_ITEMS : classifies
    PAYROLL_RESULTS ||--o| PAYSLIPS : publishes
    EMPLOYEES ||--o{ SALARY_ADVANCES : requests
    SALARY_ADVANCES ||--o{ SALARY_ADVANCE_EVENTS : records
```

## 6. Documents, communication và integration

```mermaid
erDiagram
    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : versions
    EMPLOYEES ||--o{ EMPLOYEE_DOCUMENTS : owns
    DOCUMENTS ||--o{ EMPLOYEE_DOCUMENTS : attaches
    ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_AUDIENCES : targets
    ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_READS : read_by
    EMPLOYEES ||--o{ ANNOUNCEMENT_READS : reads
    EMPLOYEES ||--o{ NOTIFICATIONS : receives
    NOTIFICATIONS ||--o{ NOTIFICATION_DELIVERIES : sends

    TENANTS ||--o{ INTEGRATION_CONNECTIONS : authorizes
    INTEGRATION_CONNECTIONS ||--o{ GOOGLE_SHEET_SOURCES : exposes
    INTEGRATION_CONNECTIONS ||--o{ SYNC_JOBS : runs
    SYNC_JOBS ||--o{ RAW_IMPORT_SNAPSHOTS : snapshots
    SYNC_JOBS ||--o{ SYNC_JOB_ROWS : contains
    SYNC_JOB_ROWS ||--o{ SYNC_CONFLICTS : reports
    MAPPING_TEMPLATES ||--o{ MAPPING_TEMPLATE_VERSIONS : versions
```

## 7. Audit và platform support

```mermaid
erDiagram
    TENANTS ||--o{ AUDIT_LOGS : scopes
    USERS ||--o{ AUDIT_LOGS : acts
    TENANTS ||--o{ SUPPORT_ACCESS_SESSIONS : grants
    USERS ||--o{ SUPPORT_ACCESS_SESSIONS : operates
    TENANTS ||--o{ OUTBOX_EVENTS : emits
    TENANTS ||--o{ IDEMPOTENCY_KEYS : protects
    TENANTS ||--o{ TENANT_USAGE_DAILY : measures
```

## 8. Cardinality và integrity quan trọng

- Một user có thể thuộc nhiều tenant qua memberships.
- Một employee thuộc đúng một tenant và có thể chưa liên kết user.
- Một employee có nhiều assignment lịch sử nhưng chỉ một assignment chính hiệu lực nếu tenant không cho phép kiêm nhiệm.
- Attendance event là immutable; adjustment tham chiếu request khi có.
- Leave balance được suy ra từ transactions, không phải một con số chỉnh tay.
- Request giữ nhiều version và chỉ một workflow instance active.
- Payroll cycle tham chiếu đúng một config version snapshot.
- Payslip tham chiếu payroll result và document version.
- Support access không làm thay đổi membership tenant.

## 9. Unique constraint tối thiểu

- `tenants(code)`.
- `memberships(tenant_id, user_id)` cho membership active.
- `employees(tenant_id, employee_code)`.
- `departments(tenant_id, code)`.
- `positions(tenant_id, code)`.
- `attendance_events(tenant_id, idempotency_key)`.
- `requests(tenant_id, request_no)`.
- `payroll_cycles(tenant_id, cycle_code)`.
- `payroll_results(tenant_id, payroll_cycle_id, employee_id)`.
- `sync_jobs(tenant_id, idempotency_key)` khi key có giá trị.

## 10. Ranh giới bảo mật

- RLS kiểm tra `tenant_id` trên mọi bảng tenant-scoped.
- Employee/Manager/HR/Payroll áp thêm scope theo `PERMISSION_MATRIX.md`.
- Platform Operator không tự động vượt RLS tenant.
- Support chỉ truy cập thông qua session tạm thời đúng tenant/scope.
- Service-role key chỉ tồn tại ở backend/worker, không nằm trong web/mobile.
