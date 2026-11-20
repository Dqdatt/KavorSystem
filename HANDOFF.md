# HANDOFF — 20/11/2026 (phiên 24 → phiên mới: feedback PWA)

**Mục tiêu phiên vừa rồi:** dùng PWA thay app native trước; ngày Apple duyệt chỉ đổi biến Render, không code lại.
Người dùng **không dùng `giao`** ở dự án này — workflow agent Claude (timcode/laptrinh/chaylenh/kiemtra).

## Đã xong
- `84a4df8` (đã push = deploy): PWA `experiments/kavor-pwa` vào git — proxy `api/proxy.mjs` giữ refresh token trong cookie HttpOnly `kv_rt`
  (trang chỉ thấy `httponly`), service worker thật (`tools/postbuild.mjs`), máy tên "… (PWA)" (`shims/device.ts`), banner cài/tải app
  (`shims/install-banner.ts`), đính kèm ≤ 3 MB. API: `MOBILE_IOS_URL`/`MOBILE_ANDROID_URL` → `GET /meta` `appLinks` + link trong thư mời
  (cùng link thì ghi một lần). verify-all thêm test proxy + build PWA. DEPLOY 7b/7c.
- `40f37b5`: commit rỗng kích hoạt Vercel. **PWA online: https://kavor-app.vercel.app** (project Vercel `kavor-app`, Root
  `experiments/kavor-pwa`, Branch Tracking = nhánh deploy). Đã kiểm: màn đăng nhập, font, SW + cache, `/api/v1/meta` qua proxy (sin1),
  refresh không cookie → 401, `?__p=../` → 404, không lỗi console. API Render đã chạy bản mới (`/meta` có `appLinks`, đang null).

## Đang dở
- Chưa commit: `HANDOFF.md`, `docs/TASKS.md`, `docs/DEPLOY.md` (cách tạo project Vercel lần đầu khi `main` chưa có `experiments/`).
- Người dùng chưa đặt `MOBILE_IOS_URL`/`MOBILE_ANDROID_URL` = `https://kavor-app.vercel.app` trên Render → mail mời chưa có link.
- Chưa thử online: kích hoạt / đăng nhập / chấm công trên iPhone thật 4G (dữ liệu online là thật — chỉ công ty demo, không `TS-3010`).
- pgTAP local ✘ `hr_rls` #22 + `offboarding` do dữ liệu thử trong DB local (SQL không đổi); xanh lại cần `db-reset` — hỏi trước.

## Quyết định đã chốt (đừng hỏi lại)
- PWA dùng thật trước app native; link cài để ở biến Render (không làm trang Console); chuyển sang app native qua trang Thiết bị (HR duyệt).
- Push nhánh `claude/ecstatic-pascal-dblg7v` = deploy Render API + Vercel admin/console/**kavor-app**. Hạn chế push lặt vặt.
- v1 `d22f97f` là bản phát hành; dịch vụ trả phí khi có khách.

## Nợ Ponytail
- `experiments/kavor-pwa/shims/attach.ts:7` — tệp 3–5 MB không gửi được qua PWA (body hàm Vercel 4,5 MB); khi người dùng cần file lớn
  thì tải thẳng lên Storage bằng link ký sẵn.

## Việc tiếp theo
1. Nhận feedback PWA của người dùng (iPhone/Android thật), sửa từng lỗi; mã chung ở `apps/mobile/src` nên giữ đúng cả app native — `[opus high]`
   (đụng đăng nhập/phiên/cookie/proxy → `[opus xhigh]`). Thử local: cấu hình `pwa` trong `.claude/launch.json` (cổng 8091, cần `pnpm dev:backend`).
2. Người dùng: đặt `MOBILE_*_URL` trên Render, mời NV công ty demo, thử iPhone 4G — `[haiku]`.
3. Backlog Vòng 1 như cũ (`docs/TASKS.md`).

## File cần đọc đầu tiên
- `experiments/kavor-pwa/README.md` (kiến trúc, shim, giới hạn), `experiments/kavor-pwa/api/proxy.mjs`, `docs/DEPLOY.md` 7b/7c, `docs/TASKS.md`.
