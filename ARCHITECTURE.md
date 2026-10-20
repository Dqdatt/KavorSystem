# Kavor implementation architecture

## Workspace

```text
apps/
  admin-web/    Next.js HR/Admin Web
  console-web/  Next.js Kavor Console
  api/          NestJS REST API
  mobile/       Expo/React Native iOS + Android
packages/
  contracts/    Shared API/domain types
  web-ui/       Shared web dashboard components
supabase/
  migrations/   Versioned PostgreSQL schema
  seed.sql      Fictional development seed
sample-data/    CSV import fixtures
```

## Ranh giới

- Web/mobile không dùng service-role key.
- API chịu trách nhiệm tenant context, permission, validation, transaction và audit.
- PostgreSQL RLS là lớp bảo vệ bổ sung bắt buộc.
- Background job luôn mang tenant context và idempotency key.
- Google Sheets đi qua raw snapshot → staging → validation → domain service.

## Trạng thái hiện tại

Foundation đã có:

- Hai web app chạy trên Next.js App Router.
- Một ứng dụng Expo chung cho iOS/Android.
- NestJS API với response envelope và correlation ID.
- Contracts dùng chung.
- Migration multi-tenant cơ bản cùng RLS read policies.
- Seed tenant Hải Đăng Group bằng dữ liệu hư cấu.
- CI cho typecheck, test và build.

Chưa có trong foundation:

- Supabase Auth client/server integration thực tế.
- Permission resolver đầy đủ và write policies.
- Domain module attendance/leave/payroll.
- Queue/Redis và Google OAuth.
- Native development build/signing trên App Store/Google Play.
