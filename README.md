# Kavor System

Monorepo triển khai Kavor HRM cho:

- HR/Admin Web.
- Kavor Console.
- Mobile iOS và Android.
- Backend API.
- Supabase/PostgreSQL migrations.

## Yêu cầu

- Node.js 22.13 trở lên.
- pnpm 11.
- Docker hoặc OrbStack nếu chạy Supabase local.
- Xcode cho iOS và Android Studio cho Android.

## Cài đặt

```bash
pnpm install
cp .env.example .env.local
```

## Chạy ứng dụng

```bash
pnpm dev:api
pnpm dev:admin
pnpm dev:console
pnpm dev:mobile
```

Mặc định:

- API: `http://localhost:4000/api/v1`
- HR/Admin: `http://localhost:3000`
- Console: `http://localhost:3001`
- Mobile: Expo development server.

### Chạy mobile bằng Expo Go

Mobile hiện khóa ở Expo SDK 57 để tương thích với bản Expo Go đang phát hành trên App Store/Google Play.

Nếu Metro đã được mở trước khi đổi SDK, dừng tiến trình cũ rồi chạy lại và xóa cache:

```bash
pnpm --filter @kavor/mobile start -- --clear
```

Máy thật và máy chạy Metro phải cùng mạng LAN. Nếu Expo Go vẫn báo sai phiên bản, cập nhật Expo Go lên bản mới nhất rồi quét lại QR. Với production, Kavor sẽ dùng development build riêng thay cho Expo Go.

Có thể review giao diện mobile trên trình duyệt bằng:

```bash
pnpm --filter @kavor/mobile web
```

## Database local

```bash
pnpm db:start
pnpm db:reset
```

Supabase local cần Docker-compatible runtime. Không expose local stack ra internet.

## Kiểm tra

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Tài liệu

Xem `PRODUCT_SPEC.md`, `DATABASE_SCHEMA.md`, `PERMISSION_MATRIX.md`, `API_CONTRACT.md` và `IMPLEMENTATION_ROADMAP.md` tại thư mục gốc.
