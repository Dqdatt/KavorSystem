# Kế hoạch module Bản tin nội bộ

> Viết bởi Claude ngày 26/10/2026 sau khi đọc PILOT_RULEBOOK §11, DATABASE_SCHEMA §12, PERMISSION_MATRIX (Documents và communication),
> USER_STORIES US-061, prototype HR `page-announcements` và prototype mobile `news`/`newsDetail` (đã port ở `apps/mobile/src/screens/news.tsx`).

## Quyết định của người dùng (26/10/2026)

- **Đính kèm file làm luôn**, tùy từng bài (không bắt buộc).
- **Chỉ tính "đã mở"**: nhân viên mở bài là đã đọc; không có nút "Tôi đã đọc" (prototype mobile cũng không có).
- **HR chọn gửi thông báo cho từng bài** (ô "Gửi thông báo trong app" khi soạn).

## Phạm vi

**Làm:** HR soạn bài (tiêu đề, danh mục Thông báo/Chính sách/Sự kiện, nội dung chữ thuần, quan trọng, ghim, người nhận toàn công ty hoặc
chọn chi nhánh/phòng ban, một file đính kèm PDF/ảnh), lưu nháp, xuất bản ngay hoặc hẹn giờ, sửa, gỡ bài, xóa nháp/bài hẹn chưa tới giờ;
theo dõi đã đọc (x/y người nhận, danh sách chưa đọc). Mobile: tab Bản tin, chi tiết bài, bài mới trên Trang chủ, tải file đính kèm,
thông báo mở đúng bài.

**Để sau:** chọn người nhận theo vai trò, nhiều file mỗi bài, quét virus file (chưa có dịch vụ quét — chỉ nhận PDF/PNG/JPEG/WebP nhận
dạng theo byte đầu file), "Lưu tin"/"Chia sẻ" theo người dùng (giữ toast như prototype), người đăng có phạm vi phòng ban
(bây giờ cần `announcement.publish` toàn công ty), push khi app tắt (cần tài khoản Apple trả phí).

## Quyết định kỹ thuật (Claude)

- Nội dung là chữ thuần, không HTML/Markdown: đoạn cách nhau bằng dòng trống, đoạn mà mọi dòng bắt đầu bằng `- ` là danh sách
  gạch đầu dòng — đúng cấu trúc `body: Array<string | string[]>` của prototype mobile. Hàm tách dùng chung ở `@kavor/contracts`.
- Người nhận: nhân viên chưa nghỉ việc có phân công chính đang hiệu lực (theo ngày của công ty) thuộc chi nhánh đã chọn, hoặc thuộc
  phòng ban đã chọn **hoặc phòng ban con** của nó. Tính lúc đọc (người mới vào phòng sau khi đăng vẫn thấy bài).
- Trạng thái suy ra từ cột: nháp (`publish_at` null), hẹn giờ (`publish_at` > now), đã xuất bản, đã gỡ (`archived_at`).
- Thông báo tạo bằng hàm SQL `notify_due_announcements()` (đúng quy ước "thông báo tạo ở SQL"): gọi ngay khi xuất bản và theo chu
  kỳ quét 10 phút sẵn có của API cho bài hẹn giờ; `notified_at` + `dedupe_key` chống gửi trùng. Thông báo không chép nội dung bài.
- File: bucket riêng tư `announcement-files`, thư mục theo tenant, tối đa 5 MB; client tải qua API (như logo/ảnh bìa). Giới hạn
  JSON của API tăng 4 MB → 8 MB để nhận base64 của file 5 MB.

## Thứ tự

migration `202611010001_announcements.sql` → pgTAP `announcements.test.sql` → contracts → API `apps/api/src/announcements/` →
`tools/announcements-smoke.sh` → web `/announcements` (bám `page-announcements`, phần soạn bài là thiết kế bổ sung) → mobile nhánh `REMOTE`
→ verify-all → PROGRESS.
