# HANDOFF — 20/11/2026 (phiên 24)

**Mục tiêu phiên:** dùng PWA thay app native trước; khi Apple duyệt chỉ đổi cấu hình, không code lại.
Người dùng: **không dùng `giao`** ở dự án này — workflow agent Claude (timcode/laptrinh/chaylenh/kiemtra).

## Đã xong (đã commit + push nhánh deploy 20/11 — Render tự deploy API)
- PWA `experiments/kavor-pwa` vào git (bỏ dòng `experiments/` ở `.git/info/exclude`; `.gitignore` chặn symlink node_modules, `.cert/`, `shots/`).
- `api/proxy.mjs`: proxy `/api/v1/*` dùng chung cho Vercel Function và `tools/serve.mjs`; refresh token chỉ ở cookie HttpOnly `kv_rt`
  (trang thấy chữ `httponly`), xóa cookie khi đăng xuất/refresh 401. Test `tools/proxy.test.mjs` (6) + thử thật qua API 4000 + Supabase local.
- `vercel.json` (pnpm install `--filter @kavor/mobile...`, `build:api`, `sin1`, rewrite `/api/v1/*` → hàm proxy, SPA fallback).
- Service worker thật (`tools/postbuild.mjs`): HTML mạng trước, file khác cache trước, giữ `kavor-img`; thử offline OK.
- `shims/device.ts`: tên máy "… (PWA)". `shims/install-banner.ts` (laptrinh): banner App Store/Google Play hoặc hướng dẫn Thêm vào MH chính.
- `shims/attach.ts`: PWA nhận file ≤ 3 MB (giới hạn body 4,5 MB của hàm Vercel) — có `shortcut:`.
- API (laptrinh, đã duyệt + siết): `MOBILE_IOS_URL`/`MOBILE_ANDROID_URL` (chỉ http(s); https ở staging/prod) → `GET /meta` trả `appLinks`,
  thư mời nhân viên có link (iPhone/Android cùng link PWA thì ghi một lần). `render.yaml`, `.env.example`, `docs/DEPLOY.md` 7b (deploy PWA) + 7c (ngày Apple duyệt), AGENTS cạm bẫy, PROGRESS quyết định.
- `verify-all`: thêm test proxy PWA (mọi chế độ) + build PWA (bản đầy đủ). `.claude/launch.json`: cấu hình `pwa` (cổng 8091).

## Kiểm
- `verify-all --quick`: typecheck, unit test, test PWA ✔; `pnpm build` + build PWA ✔; **pgTAP ✘** `hr_rls` #22 + `offboarding` (trùng membership NV `…05`) — do dữ liệu
  đang có trong DB local (không đổi SQL nào); chưa reset DB vì mất dữ liệu thử của người dùng. Chưa chạy verify-all đầy đủ.
- `node tools/smoke-ui.mjs` 10 màn 0 lỗi. Banner/đăng nhập/refresh/offline thử trên Browser pane (UA Android).

## Đang dở / chưa kiểm
- Chưa deploy lên Vercel thật: rewrite `?__p=`, hàm Web-handler (`export GET/POST`), install pnpm ở gốc, font ở `dist/assets/__node_modules/.pnpm/…`
  (thư mục có dấu chấm) — kiểm ngay sau lần deploy đầu.
- Server PWA cũ của phiên 23 vẫn chạy nền ở 8090/8443 (code cũ trong bộ nhớ): `pkill -f "tools/serve.mjs"`.

## Quyết định đã chốt (đừng hỏi lại — PROGRESS "Quyết định đã chốt")
- 20/11: PWA dùng thật trước app native; link cài để ở biến Render (không làm trang Console); chuyển máy qua trang Thiết bị (HR duyệt).
- v1 `d22f97f` là bản phát hành; dịch vụ trả phí khi có khách. Tạm ứng 2 bước: chặn một người duyệt cả 2 bước.

## Việc tiếp theo
1. Người dùng: tạo project Vercel `kavor-app` + biến Render `MOBILE_*_URL` theo DEPLOY 7b → thử iPhone 4G `[haiku]`; kiểm các điểm "chưa deploy thật" ở trên.
2. Nếu muốn pgTAP xanh: `bash tools/db-reset.sh && supabase test db` (mất dữ liệu thử local — hỏi trước).
3. Backlog Vòng 1 như cũ (`docs/TASKS.md`).

## File cần đọc đầu tiên
- `experiments/kavor-pwa/README.md`, `experiments/kavor-pwa/api/proxy.mjs`, `docs/DEPLOY.md` 7b/7c, `docs/TASKS.md`.
