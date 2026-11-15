# HANDOFF — 15/11/2026 (phiên 3)

**Mục tiêu phiên vừa rồi:** làm hộp Nhập file nhân viên 3 bước theo prototype v2 (việc 2 của HANDOFF trước).

## Đã xong
- `91f93ad` hộp Nhập file 3 bước (`apps/admin-web/app/_ui/employee-import.tsx`): Tải mẫu .xlsx (không bắt buộc) → kéo thả/bấm chọn (class `.dropzone` trong `kavor.css`) → xem trước như cũ; chấm `.tl` done/now/bad theo trạng thái
- File mẫu tĩnh `apps/admin-web/public/mau-nhap-nhan-vien.xlsx` (11 cột, 2 dòng ví dụ), tạo bằng `python3 tools/make-import-template.py` (chỉ thư viện chuẩn); test trong `import.service.test.ts` đọc mẫu qua bộ đọc thật
- `detect.ts`: cột "Email đăng nhập" / "login email" giờ nhận theo tên cột (trước đó chính nhãn Kavor không khớp)
- Đã push `e7d90e3`, `f4c10b2`, `91f93ad` (= deploy). verify-all --quick đạt (API test 81, pgTAP 586); đã thử kéo thả mẫu ở localhost:3000

## Đang dở
- Không có code dở. Chưa mở bản online sau deploy để xem hộp (chỉ xem, không bấm nhập).
- `docs/plans/roadmap-competitive.md` chưa track — có từ trước phiên này, chưa rõ của ai, không commit.

## Quyết định đã chốt
- Mẫu chỉ là gợi ý, hộp ghi rõ "không bắt buộc"; giữ nút "Nhập N hồ sơ" (không dùng "Tiếp tục" như prototype).
- Không làm "sửa dòng lỗi ngay trên bảng" của prototype: lỗi sửa trong file rồi tải lại.
- Bản online là dữ liệu thật: chỉ xem. Hộp thao tác so ở local.

## Mẹo local
- smoke-lib phải chạy bằng `bash -c 'source tools/smoke-lib.sh; …'` — zsh coi biến `path` trong `call()` là PATH.
- DB local vừa reset thì HD0007 chưa kích hoạt: `activate HD0007 thao.mai@haidang.vn` → `admin/mfa/enroll` + `verify`, giữ secret, `totp` để đăng nhập web (localhost:3000).

## Nợ Ponytail
- Không có `shortcut:` mới. Cũ: `kit.tsx` `vs()` cụm > 40 ký tự; `employees/page.tsx` DocTicks.

## Việc tiếp theo
1. Dọn lệch nhỏ: ~50 chỗ "·" → `|`; chức danh người gửi ở chi tiết đơn + "Chưa có app" ở người đọc bài (thêm trường API); so chi tiết tài liệu `[sonnet]`
2. Màn prototype có, web chưa có, chỉ UI: Điểm mới, Ghi chú phiên bản, "Hồ sơ của tôi", Thêm khoản phụ cấp mẫu `[opus high]`

## File cần đọc đầu tiên
- `docs/TASKS.md`
- `docs/plans/web-hr-v2-checklist.md`
- `apps/admin-web/app/_ui/kit.tsx`
- `tools/smoke-lib.sh`
