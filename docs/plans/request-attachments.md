# Minh chứng đính kèm đơn (giải trình, nghỉ phép)

> Claude (Desktop), 31/10/2026. Căn cứ: PILOT_RULEBOOK (nghỉ ốm `SL` từ 2 ngày liên tiếp yêu cầu minh chứng, HR kiểm tra sau Manager),
> `leave_types.attachment_from_days` đã có từ module nghỉ phép, prototype mobile (ô "Thêm ảnh hoặc PDF, tối đa 5 MB" + thẻ file ở form giải trình).

## Đã làm

- **DB** `202611140001_request_attachments.sql`: bảng `request_attachments` (bất biến, không xóa; tên file, loại, dung lượng, SHA-256,
  `scan_status` = `not_scanned`). Trigger: chỉ đơn giải trình/nghỉ **đang chờ** của cùng tenant, tối đa 3 file (khóa dòng đơn).
  `approval_tasks_attachment_guard`: đơn có `policy_snapshot.attachmentRequired` mà chưa có file thì **bước duyệt cuối** không duyệt được
  (bước HR bị bỏ qua thì bước quản lý là bước cuối); bước trước vẫn duyệt được, từ chối luôn được. RLS = quyền đọc đơn (`can_read_request`).
  pgTAP `request_attachments.test.sql` 13.
- **API**: `POST /me/requests/:id/attachments` (người gửi; PDF/PNG/JPEG/WebP nhận dạng theo nội dung, ≤ 5 MB), `POST …/:attId/file-link` + `GET …/file`
  (liên kết ký 5 phút: người gửi, quản lý được giao một bước của đơn, người duyệt theo quyền HR/Kế toán), `GET /admin/requests/:id/attachments/:attId/file`
  (`request.read` theo phạm vi). Audit `request.attachment_added`, `request.attachment_downloaded`. `RequestItem` thêm `attachments`,
  `attachmentRequired`, `canAttach`. Bucket riêng tư `request-attachments/<tenantId>/` (xóa doanh nghiệp tự dọn — liệt kê mọi bucket).
  Smoke `tools/attachments-smoke.sh` 25 bước.
- **Web HR**: modal Đơn & phê duyệt có dòng "Minh chứng" (mở từng file) hoặc nhãn đỏ "Bắt buộc · nhân viên chưa đính kèm" + dòng giải thích cho người duyệt.
- **App** (bản dùng API): ô minh chứng ở Giải trình công và Tạo đơn nghỉ (giao diện thẻ file của prototype; chọn **Chụp ảnh / Chọn ảnh / Chọn tệp PDF**,
  tối đa 3); file tải lên sau khi tạo đơn — lỗi tải không làm hỏng đơn, màn "Đã gửi" nhắc mở đơn để thêm lại. Chi tiết đơn (của tôi + cần duyệt):
  danh sách minh chứng (bấm mở bằng trình duyệt hệ thống), nút "Thêm minh chứng" khi đơn còn chờ. Thư viện `expo-image-picker`, `expo-document-picker`
  (cần build native mới + `pod install`); quyền Camera/Thư viện ảnh khai trong `app.json` và Info.plist/AndroidManifest hiện có.
  Ảnh lấy dạng JPEG (iPhone chụp HEIC), chất lượng 0,6. Test Node `tools/attach-mobile-test.mjs` 4 ca.

**Đã thử trên simulator iPhone 11 (bản Release, API local, 31/10):** chi tiết đơn hiện danh sách minh chứng; bấm mở PNG trong Safari; "Thêm minh chứng"
→ hộp chọn 3 nguồn → thư viện ảnh → tải lên (JPEG 2,4 MB từ ảnh mẫu độ phân giải cao, không còn GPS) → đơn cập nhật; form Tạo đơn nghỉ hiện ô minh chứng.
Chưa thử: chụp ảnh (simulator không có camera), chọn PDF, gửi đơn mới kèm file từ form, Android, iPhone thật. Ảnh 12 MP chất lượng 0,6 có thể
gần 5 MB — nếu hay vượt thì thêm thu nhỏ ảnh (`expo-image-manipulator`).

## Quyết định mặc định — chờ người dùng review

1. **Đơn cần minh chứng vẫn gửi được khi chưa có file**, chỉ chặn ở bước duyệt cuối (nghỉ ốm thường xin trước, giấy khám có sau).
2. Chặn ở **bước cuối**, không chặn quản lý ở bước đầu (rulebook: HR kiểm tra sau Manager).
3. Tối đa **3 file/đơn, 5 MB/file**, PDF/PNG/JPEG/WebP; file **không xóa được** (gửi nhầm thì hủy đơn gửi lại) — giữ được bằng chứng khi tranh chấp.
4. Chỉ **giải trình** và **nghỉ phép** có minh chứng; OT, tạm ứng, sửa hồ sơ chưa có.

## Chưa làm

- Quét virus (cột `scan_status` có sẵn, luôn `not_scanned`); ảnh xem trước trong app (đang mở bằng trình duyệt hệ thống).
- Cấu hình bắt buộc minh chứng cho giải trình theo quy định (hiện luôn không bắt buộc).
- Nhắc nhân viên khi đơn bị kẹt vì thiếu minh chứng (thông báo).
