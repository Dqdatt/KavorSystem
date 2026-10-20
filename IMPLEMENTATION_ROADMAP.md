# Kavor HRM — Implementation Roadmap

> Phiên bản: 1.0  
> Ngày bắt đầu giả định: sau khi hoàn tất Discovery  
> Thời lượng mục tiêu: 20 tuần, 10 sprint × 2 tuần  
> Mục tiêu: pilot một doanh nghiệp 50–300 nhân viên

## Trạng thái ngày 20/10/2026

Sprint 1 đang thực hiện. Baseline monorepo, hai web app, API, mobile iOS/Android, migration/seed và CI đã có; typecheck, unit test hiện có và production build đều đạt. Phần staging, secret management, signing/phân phối mobile, crash reporting và migration check bằng Supabase runtime còn phải hoàn thiện trước khi đóng Sprint 1.

## 1. Kết quả cần đạt

Cuối roadmap, Kavor có:

- Mobile app phát hành cho cả iOS và Android.
- HR/Admin Web vận hành tenant.
- Employee Web cho các tác vụ tự phục vụ chính.
- Kavor Console vận hành tenant, job, incident, release và support access.
- Backend/API, PostgreSQL, storage, worker và monitoring dùng chung.
- Import Excel/CSV và Google Sheets một chiều có kiểm soát.
- Quy trình công–phép–đơn từ–payroll đủ để pilot.

## 2. Giả định nguồn lực

| Vai trò | Số lượng |
|---|---:|
| Product Owner/BA | 1 |
| Product Designer | 1 |
| Web Engineer | 1–2 |
| Mobile Engineer React Native | 1–2 |
| Backend Engineer | 2 |
| QA Engineer | 1 |
| DevOps/SRE | 0,5 |
| HR/Payroll SME | 0,5 |

Nếu đội chỉ có 2–3 kỹ sư, cần giảm phạm vi hoặc kéo dài khoảng 7–10 tháng. Không nên cắt tenant isolation, audit, test mobile thật hoặc backup/restore để giữ deadline.

## 3. Luồng công việc song song

```text
Product/Design ──► Spec, rulebook, design system, UAT
Platform/API   ──► Tenant, auth, RBAC, RLS, audit, domain modules
Web            ──► HR/Admin, Employee Web, Kavor Console
Mobile         ──► Shared React Native app ─► iOS build ─► App Store
                                      └─────► Android build ─► Google Play
Data/Integr.   ──► Import, Google Sheets, staging, reconciliation
QA/SRE         ──► Automation, security, observability, release, runbook
```

## 4. Sprint 0 — Discovery và khóa phạm vi

### Product/BA

- Chọn doanh nghiệp pilot và người chịu trách nhiệm UAT.
- Thu thập dữ liệu mẫu đã ẩn danh: nhân viên, tổ chức, ca, công, phép, payroll.
- Viết rulebook cho attendance, leave, OT, payroll và approval.
- Chốt dataset nào lấy từ Kavor, Sheet hoặc hệ thống ngoài.
- Chốt tiêu chí thành công pilot.

### Design

- Đối chiếu ba prototype đã chốt.
- Chuẩn hóa design tokens và component inventory.
- Hoàn thiện missing/error/empty/loading/offline states.
- Chốt responsive web và accessibility.
- Chốt luồng permission, GPS, notification và biometric trên iOS/Android.

### Engineering

- Architecture Decision Records: monorepo, auth, tenant context, queue, storage.
- ERD review từ `DATABASE_SCHEMA.md`.
- Threat model và data classification.
- Spike GPS/offline attendance trên thiết bị iOS và Android thật.

### Exit criteria

- `PRODUCT_SPEC.md`, `DATABASE_SCHEMA.md`, `PERMISSION_MATRIX.md` được duyệt.
- Backlog P0 được estimate.
- Dữ liệu mẫu và rulebook pilot sẵn sàng.
- Không còn quyết định blocker về nguồn dữ liệu/payroll mode.

## 5. Sprint 1 — Foundation và developer experience

### Build

- Khởi tạo monorepo và package dùng chung.
- Web: Next.js + TypeScript.
- Mobile: React Native + TypeScript cho iOS/Android.
- API: NestJS + OpenAPI.
- PostgreSQL/Supabase migrations.
- CI cho lint, typecheck, unit test và migration check.
- Environment: local, development, staging.
- Secret management và config validation.
- Design tokens/component primitives cho web và mobile.

### Mobile riêng

- Bundle ID iOS và application ID Android.
- Build schemes/flavors dev–staging–production.
- Signing baseline, internal distribution và crash reporting.
- Navigation, secure storage và networking layer.
- Motion system cho mobile: screen transition, tab/FAB micro-interaction, progress khi nhấn giữ chấm công, success/loading state; tôn trọng thiết lập Reduce Motion và không dùng animation để truyền tải thông tin bắt buộc.

### Exit criteria

- Một commit có thể build web, API, iOS và Android trên CI.
- Staging health check hoạt động.
- Không có secret trong source control.

## 6. Sprint 2 — Tenant, Auth, RBAC, RLS và audit

### Build

- Tenant provisioning.
- User, membership, invitation và account activation.
- Role, permission và organizational scope.
- Tenant context middleware.
- RLS policies và automated isolation tests.
- Audit framework, correlation ID, outbox và idempotency.
- Kavor Console: tenant list/create/suspend cơ bản.
- HR/Admin: login, tenant switch nếu có và role-aware navigation.

### Mobile iOS/Android

- Activation/login/OTP/recovery.
- Secure token storage.
- Device installation registration.
- Session expiry và revoke handling.

### Exit criteria

- Tạo tenant/user không cần sửa code.
- Tenant A không thể đọc/ghi tenant B.
- Login/logout/revoke chạy trên iOS và Android thật.
- Audit ghi đúng actor, tenant và correlation ID.

## 7. Sprint 3 — Organization và employee master

### Build

- Legal entity, branch, location, department, team, position.
- Employee profile và employment status.
- Assignment history với ngày hiệu lực.
- Employee list/profile trên HR/Admin.
- Employee self-profile trên mobile/web.
- Change request cho trường được phép.

### Data

- Template Excel/CSV.
- Import staging, mapping, validation và error report.
- Idempotent employee upsert.

### Exit criteria

- Import được ít nhất 1.000 nhân viên.
- History không bị ghi đè.
- Employee chỉ thấy hồ sơ của mình.
- Manager scope đúng theo assignment.

## 8. Sprint 4 — Google Sheets connector

### Build

- Google OAuth với scope read-only mặc định.
- Chọn spreadsheet/tab.
- Mapping template versioned.
- Raw snapshot, staging, preview/diff và confirmation.
- Manual sync, job status, retry và conflict review.
- HR/Admin Integrations page.
- Kavor Console job metadata và health.

### Exit criteria

- Import/sync nhân viên Sheet → Kavor chạy ổn định.
- Không ghi đè conflict mà không cảnh báo.
- Token được lưu qua secret reference và có thể revoke.
- Quota/backoff được kiểm thử.

## 9. Sprint 5 — Shift, schedule và mobile attendance

### Backend/Web

- Shift definition, work schedule, assignment và work location.
- Attendance event API idempotent.
- Geofence verification.
- HR/Admin schedule và attendance event view.

### Mobile iOS/Android

- Check-in/check-out UI.
- Location permission theo ngữ cảnh.
- Accuracy/geofence feedback.
- Offline encrypted queue và retry.
- Pending/success/failure states.
- App resume/background edge cases.

### Test matrix

- iOS: permission denied/limited, airplane mode, app killed/resumed.
- Android: permission denied/approximate, OEM background limits, airplane mode.
- Duplicate tap, clock drift, invalid device, out-of-geofence.

### Exit criteria

- Không có attendance event trùng khi retry.
- Thiết bị iOS và Android pilot chấm công được online/offline.
- Event gốc immutable và audit đầy đủ.

## 10. Sprint 6 — Timesheet, exception và explanation

### Build

- Daily/monthly timesheet calculation.
- Late/early/missing-event exception.
- Explanation request và attachment.
- Manager/HR approval.
- Attendance adjustment và recalculation.
- Timesheet lock/unlock có permission/audit.

### Bề mặt

- Mobile: bảng công, bất thường và giải trình.
- HR/Admin: dashboard bất thường, bảng công và khóa kỳ.
- Kavor Console: health/job metrics liên quan.

### Exit criteria

- Chạy trọn một tuần công bằng dữ liệu thử.
- Giải trình không sửa event gốc.
- Khóa kỳ chặn mutation trái phép.

## 11. Sprint 7 — Leave, OT và workflow engine

### Build

- Leave type/policy/assignment.
- Leave ledger và balance projection.
- Leave/OT request.
- Workflow definition/version/step.
- Sequential approval MVP, delegate và SLA cơ bản.
- Approval inbox mobile/web.
- Push notification APNs/FCM.

### Exit criteria

- Leave balance giải thích được bằng ledger.
- Workflow snapshot không đổi theo policy mới.
- Manager chỉ duyệt task được gán trong scope.
- Deep link notification hoạt động trên iOS và Android.

## 12. Sprint 8 — Payroll operations và payslip

### MVP mode

Ưu tiên `final_result_import`. Không triển khai calculation engine tổng quát trong sprint này.

### Build

- Payroll config/version theo tenant.
- Pay component và mapping.
- Payroll cycle state machine.
- Import Excel/CSV/Google Sheet.
- Validation, reconciliation và error workflow.
- Review/approve/publish/close.
- Payslip generation và signed URL.
- Salary advance cơ bản.

### Mobile iOS/Android

- Payslip list/detail.
- Re-authentication qua PIN/password hoặc biometric OS.
- Ẩn/hiện số tiền và secure screen policy phù hợp.

### Exit criteria

- Tenant khác nhau dùng mapping/config khác nhau.
- Kỳ đóng không sửa trực tiếp.
- Phiếu lương chỉ đúng nhân viên/role được xem.
- Không có payroll value trong log, analytics hoặc crash report.

## 13. Sprint 9 — Documents, announcements và Console operations

### Tenant product

- Document upload/version/expiry/access.
- Không có chữ ký số.
- Announcement, audience và read status.
- Notification center và delivery tracking.
- Employee Web cho hồ sơ, đơn, công, phép, payslip và tài liệu.

### Kavor Console

- Subscription và usage.
- Sync jobs, incident và service health.
- Feature flag.
- Mobile release/minimum-version policy riêng cho iOS/Android.
- Support access session có reason/scope/expiry.
- Platform audit.

### Exit criteria

- Support không có quyền mặc định vào dữ liệu nhạy cảm.
- Signed URL hết hạn đúng.
- Feature flag target theo tenant.
- Minimum version xử lý riêng theo OS và app version.

## 14. Sprint 10 — Hardening, UAT và release candidate

### Quality

- E2E cho tám hành trình P0.
- Security/RLS/IDOR test.
- Load test giờ vào/ra ca, import và publish payslip.
- Accessibility web/mobile.
- Kiểm tra restore backup.
- Data reconciliation và migration rehearsal.

### Mobile release

- TestFlight cho iOS.
- Google Play Internal/Closed Testing cho Android.
- Store metadata, privacy disclosure và permission copy.
- Review crash-free rate, ANR và startup performance.
- Quy trình rollback/force update.

### Operations

- Dashboard, alert, runbook và on-call contact.
- Incident drill: DB unavailable, queue stuck, Google quota, push failure.
- Hướng dẫn HR, Manager và Tenant Admin.

### Exit criteria

- UAT sign-off.
- Không còn P0 defect; P1 có owner và workaround.
- Restore rehearsal thành công.
- iOS/Android release candidate được pilot chấp nhận.

## 15. Pilot và go-live

### Tuần pilot 1

- Tạo tenant production.
- Import organization, employee và leave opening balance.
- Thiết lập shift, workflow, payroll mapping.
- Mời nhóm pilot nội bộ.
- Phát hành iOS qua TestFlight/custom distribution phù hợp; Android qua closed testing/managed distribution trước public release.

### Tuần pilot 2

- Chạy song song có thời hạn với quy trình cũ.
- Reconcile attendance, leave và payroll.
- Theo dõi activation, sync errors và mobile crashes hằng ngày.
- Sửa blocker; không thay đổi scope lớn trong kỳ pilot.

### Go-live gate

- Reconciliation được HR/Payroll ký xác nhận.
- Backup/restore, support và incident process sẵn sàng.
- Nhân viên có kênh hỗ trợ và tài liệu sử dụng.
- Quyết định rõ ngày nguồn cũ chuyển read-only.

## 16. Backlog theo ưu tiên

### P0 — Pilot

- Tenant isolation, auth, RBAC, RLS, audit.
- Organization, employee và import.
- Google Sheets manual sync.
- Shift, attendance, timesheet, explanation.
- Leave, OT, workflow.
- Payroll result import, payslip, salary advance.
- Mobile iOS/Android employee/manager.
- HR/Admin Web và Kavor Console cơ bản.
- Notification, monitoring, backup và support access.

### P1 — Sau pilot

- Scheduled Sheet sync.
- Employee Web hoàn chỉnh.
- Payroll input export nâng cao.
- Custom request type và advanced workflow.
- Document expiry reminder và read acknowledgment.
- QR/Wi-Fi attendance, SSO, public API/webhook.

### P2 — Mở rộng

- Payroll calculation engine.
- Dedicated tenant deployment.
- BI nâng cao, onboarding/offboarding.
- Recruitment, performance, LMS và asset management.

## 17. Release strategy iOS/Android

| Nội dung | iOS | Android |
|---|---|---|
| Internal test | TestFlight Internal | Play Internal Testing |
| Pilot | TestFlight External hoặc distribution phù hợp | Closed Testing/Managed Play |
| Production | Apple App Store | Google Play Production |
| Push | APNs | FCM |
| Signing | Certificate/profile/App Store Connect | Keystore/Play App Signing |
| Version policy | `minimum_ios_version` | `minimum_android_version` |

Quy tắc:

- Cùng feature cốt lõi nhưng có thể rollout theo OS bằng feature flag.
- Không bắt buộc hai store duyệt cùng thời điểm; backend phải tương thích tối thiểu N-1 app version trong cửa sổ rollout.
- Forced update chỉ dùng cho lỗi bảo mật hoặc incompatibility nghiêm trọng.
- Release checklist bắt buộc có thiết bị thật đại diện cho doanh nghiệp pilot.

## 18. Test plan tối thiểu

### Automated

- Unit: leave ledger, timesheet, workflow, payroll validation, mapping.
- Integration: PostgreSQL/RLS, storage, queue, Sheets, APNs/FCM adapter.
- Contract: mobile/web với OpenAPI.
- E2E: tenant, import, attendance, request, payroll, support access.

### Thiết bị thật

- Ít nhất hai đời iPhone/iOS được pilot sử dụng.
- Ít nhất ba Android thuộc nhóm phổ biến của pilot, gồm một thiết bị cấu hình thấp.
- Mạng yếu, offline, timezone, permission denied và app upgrade.

## 19. Chỉ số release gate

- Không có P0 security/data-integrity bug.
- Cross-tenant test pass 100%.
- Crash-free sessions mục tiêu tối thiểu 99,5% trong pilot ổn định.
- Attendance success trên 99% khi đủ quyền/mạng; retry offline không tạo trùng.
- Google Sheet sync thành công trên 98%, lỗi có thể retry/giải thích.
- Payroll reconciliation khớp dữ liệu được HR xác nhận.
- Backup restore đạt RPO/RTO đã ký với pilot.

## 20. Rủi ro và kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| App Store review làm chậm | Gửi bản review sớm, dùng TestFlight cho pilot |
| Android phân mảnh/OEM kill background | Không phụ thuộc background cho xác nhận công; test thiết bị pilot |
| GPS không ổn định | Accuracy threshold, bán kính cấu hình, phương án QR/Wi-Fi P1 |
| Sheet được chỉnh song song | Source-of-truth matrix, preview/diff, conflict review |
| Payroll rule tăng scope | MVP import kết quả, config versioned, không làm engine tổng quát |
| Rò rỉ chéo tenant | Tenant context, RLS, isolation tests và security review |
| Đội nhỏ | Giữ P0, hoãn Employee Web nâng cao và P1/P2 |

## 21. Việc bắt đầu trong tuần đầu

1. Chỉ định Product Owner và doanh nghiệp pilot.
2. Duyệt bốn tài liệu baseline trong project.
3. Thu thập dữ liệu mẫu ẩn danh và rulebook.
4. Chốt tỷ lệ thiết bị iOS/Android và OS version.
5. Chốt payroll mode và source-of-truth matrix.
6. Tạo backlog Sprint 0–2 với owner và estimate.
7. Khởi tạo monorepo, staging và CI.
8. Chạy spike tenant isolation và attendance trên hai nền tảng mobile.
