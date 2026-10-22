# PROGRESS
_Cập nhật: 2026-10-22 08:17 +07 — bởi Codex_

## Mục tiêu đang làm
Chốt UI và toàn bộ route mobile bằng cách đối chiếu từng trạng thái của `Kavor HRM Prototype.html` với bản React Native chạy trên iPhone 11. Hoàn thành khi đủ 63 cặp ảnh prototype/native, có bảng kiểm không bỏ sót và các sai khác UI/animation quan trọng đã được sửa trước khi bắt đầu backend.

## Đã xong
- Đã chụp và chuẩn hóa 63 trạng thái của prototype về kích thước 390×844 — `docs/ui-comparison/prototype/`
- Đã chụp 33 trạng thái hiện có của app native trên iPhone 11 Simulator và chuẩn hóa về 390×844 — `docs/ui-comparison/native/`
- Đã loại bỏ ảnh nguồn toàn trang và ảnh raw trùng lặp; chỉ giữ ảnh phục vụ đối chiếu — `docs/ui-comparison/`
- UI mobile hiện đã có các luồng đăng nhập/kích hoạt/quên mật khẩu, trang chủ, chấm công, đơn từ, tin tức, hồ sơ, nghỉ phép, giải trình, OT, tạm ứng, phiếu lương và phê duyệt — `apps/mobile/`
- Face ID trên iOS dùng biểu tượng hệ thống và safe area được giới hạn theo từng surface — `apps/mobile/App.tsx`

## Đang dở (QUAN TRỌNG NHẤT)
- Đang ở bước lập bộ so sánh đầy đủ: đã có 63 ảnh prototype nhưng mới có 33 ảnh native; chưa tạo ảnh ghép hai cột, manifest và báo cáo sai khác. Thư mục làm việc chính là `docs/ui-comparison/`; cần tiếp tục từ danh sách file hiện có, không chụp lại 63 ảnh prototype.
- Chưa chụp modal PIN native: mở route `kavor://home`, nhấn thẻ “Phiếu lương 09/2026” để hiện `PinModal`, sau đó lưu thành `docs/ui-comparison/native/pin.png`.
- Những trạng thái prototype chưa có route/native tương ứng cần được đánh dấu “chưa triển khai” trong manifest và dùng khung placeholder 390×844 khi ghép ảnh; không được bỏ qua.
- Code hiện tại chạy được. Kiểm tra thực tế ngày 2026-10-22: `pnpm typecheck`, `pnpm test`, `pnpm build` đều pass; test web/mobile hiện phần lớn mới là lệnh placeholder, riêng contracts/API có unit test thật.

## Quyết định đã chốt
- Mobile hỗ trợ cả iOS và Android, không phụ thuộc Expo Go; dùng native build cho máy thật — vì người dùng muốn cài trực tiếp và Expo Go từng không tương thích.
- UI mobile phải bám sát prototype HTML, gồm liquid glass, animation, safe area và navbar tự ẩn/hiện khi cuộn — vì đây là tiêu chí chốt UI trước backend.
- Supabase/PostgreSQL là database chính; Google Sheets là nguồn import vào database chứ không phải database vận hành — vì doanh nghiệp có thể chưa sẵn sàng chuyển dữ liệu ngay.
- Payroll cấu hình theo từng công ty; không phát triển chữ ký số — theo yêu cầu sản phẩm đã chốt.
- Kavor là nền tảng SaaS quản trị nhân sự cho doanh nghiệp, không phải dịch vụ đăng ký kinh doanh — để tránh hiểu sai phạm vi sản phẩm.

## Đã thử nhưng bỏ
- Expo Go cho quy trình chạy mobile chính — bỏ vì lệch phiên bản SDK và không phù hợp kiểm thử native/Face ID trên thiết bị.
- Dùng icon Face ID tự vẽ/vector — bỏ vì không giống biểu tượng Apple; iOS chuyển sang `expo-symbols`.
- Áp safe area bằng dải nền trắng độc lập ở đầu/cuối màn hình — bỏ vì tạo khoảng trắng thừa; safe area phải hòa vào background/surface của từng màn.
- Giữ ảnh chụp toàn trang và ảnh simulator raw — bỏ vì trùng dữ liệu, làm commit phình to; chỉ giữ bản 390×844 dùng để so sánh.

## Vấn đề/bug còn tồn tại
- Chưa có đủ 63 ảnh native hoặc placeholder, chưa có 63 ảnh ghép prototype–native và chưa có manifest trạng thái.
- Nhiều modal/error state của prototype chưa có route trực tiếp trong app: các sheet tạm ứng/phê duyệt/chấm công, lỗi E01–E31, punch receipt/offline/outside range, logout/help/salary question và spring states.
- Chưa kiểm chứng animation bằng video/recording; ảnh tĩnh không đánh giá được navbar ẩn/hiện và chuyển động liquid glass.
- Ảnh “native” hiện được lấy từ iPhone 11 Simulator chạy release app, chưa phải screenshot trực tiếp từ iPhone 11 vật lý.
- Các lệnh test của admin-web, console-web, mobile và web-ui vẫn là placeholder, chưa có component/device test tự động thực sự.

## Bước tiếp theo
1. Chụp `pin.png`, lập danh sách ánh xạ đủ 63 prototype state → native state và tạo placeholder cho mọi trạng thái chưa triển khai.
2. Sinh đủ 63 ảnh ghép hai cột (prototype trái, native phải), tạo `docs/ui-comparison/README.md` và manifest CSV/JSON ghi rõ matched/different/missing.
3. Review trực quan các cặp, sửa lần lượt sai khác layout/safe area/navigation/modal trong `apps/mobile/App.tsx`, rồi quay video kiểm tra animation và navbar khi cuộn trên iPhone 11 thật.

## Câu hỏi đang chờ người dùng trả lời
- Không có; tiếp tục theo bộ prototype hiện tại và dữ liệu mẫu.

## Nhật ký
- 2026-10-22 — Chụp đủ 63 màn prototype, 33 màn native và bàn giao chính xác phần ghép/đánh giá UI còn dở.
