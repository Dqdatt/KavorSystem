# CLAUDE.md — Kavor

**Nguồn chính là `AGENTS.md`** (kiến trúc, lệnh, quy ước UI, cạm bẫy theo module) — đọc nó, file này chỉ là tóm tắt + chỗ trỏ.

## Dự án
SaaS quản trị nhân sự (HRM) cho doanh nghiệp VN: web HR/Admin, Kavor Console (vận hành nền tảng), app mobile cho nhân viên.

## Stack
pnpm + Turborepo · Next.js (`apps/admin-web` :3000, `apps/console-web` :3001) · NestJS-style API TypeScript (`apps/api` :4000)
· Expo/React Native (`apps/mobile`) · Supabase/PostgreSQL local cổng 553xx (`supabase/`) · `packages/contracts`, `packages/web-ui`.

## Lệnh
- `pnpm dev:backend` (Supabase + Mailpit + API, không tự nạp lại code API) · `pnpm dev:admin` · `pnpm dev:console` · `pnpm dev:mobile`
- `bash tools/verify-all.sh [--quick]` — bắt buộc đạt trước khi báo xong/commit
- `bash tools/db-reset.sh && bash tools/<module>-smoke.sh` · `supabase test db` (pgTAP)

## Cấu trúc
- `apps/admin-web/app/(app)/<trang>` — web HR; `_ui/kit.tsx` component dùng chung; `(app)/shell.tsx` khung
- `packages/web-ui/src/kavor.css` — CSS web duy nhất (biến màu, theme `data-theme`)
- `apps/api/src/<module>` — service theo module; `supabase/migrations` + `supabase/tests`
- `tools/` smoke script, `tools/ui-compare/` so ảnh mobile; `docs/plans/` kế hoạch, `docs/adr/` quyết định

## Quy ước
- Thứ tự module: migration → pgTAP → contracts → API → smoke → web → mobile → PROGRESS.md
- Web HR theo `Kavor HR Admin Prototype v2.html` (quy trình port: `docs/plans/web-hr-v2-port.md`); mobile theo `Kavor HRM Prototype.html`
- Không hex cứng, chữ ≥ 12px, `Select` của `@kavor/web-ui`, nút trang qua `PageActions`; không sửa migration đã push

## Vùng nhạy cảm (phiên chính tự làm, Opus xhigh)
Lương/tạm ứng/luật lương (`apps/api/src/payroll`, `advance`), phân quyền/RLS/vai trò, MFA/auth/phiên, purge tenant, đồng bộ dữ liệu nhập file.

## Lưu ý
- Push nhánh `claude/ecstatic-pascal-dblg7v` = deploy Render/Vercel (`docs/DEPLOY.md`) — chạy verify-all trước.
- Không commit `.env`, key, thư mục build/native sinh ra. Việc đang mở: `docs/TASKS.md`.
