# So sánh UI: prototype ↔ app native (iPhone 11)

Bộ ảnh đối chiếu `Kavor HRM Prototype.html` với app React Native trong `apps/mobile`, cùng kích thước 390×844.

| Thư mục / file | Nội dung |
| --- | --- |
| `prototype/` | 70 trạng thái chụp từ prototype bằng Chrome headless |
| `native/` | 70 trạng thái chụp từ app trên **iPhone 11 Simulator (iOS 18.6)** |
| `android/` | 70 trạng thái chụp trên Android emulator (Pixel 6, Android 16, đặt 414×896 dp) |
| `paired/` | Ảnh ghép hai cột (trái prototype, phải native). Không commit, sinh lại bằng lệnh bên dưới |
| `paired-android/` | Ghép prototype với Android. Không commit, sinh lại bằng `UI_PLATFORM=android pair.py` |
| `manifest.json`, `manifest.csv` | Danh sách trạng thái, trạng thái khớp, điểm sai khác pixel và ghi chú |

Kết quả lần chụp 22/10/2026: **70/70 trạng thái đã có trên native**, không còn trạng thái "chưa triển khai".
Điểm `diff` (0–255, bỏ thanh trạng thái và vạch home) cao nhất ≈ 27. Phần lớn đến từ thanh trạng thái thật của iOS, cách CoreText render font Montserrat và thời điểm animation khi chụp, không phải lệch bố cục.

Bổ sung 26/10/2026: `payroll-api-list` và `payroll-api-detail` chụp nhánh UI API bằng dữ liệu fixture của prototype.
Hai state này mở prototype ở 414×896 (kích thước logic thật của iPhone 11), rồi chuẩn hóa cùng native về 390×844.
Nội dung bỏ ngân hàng/chú thích giả và kỳ chưa công bố không có trong API. Đã xem ảnh ghép; manifest ghi
`reviewed-existing-differences`: còn lệch nhỏ padding/font/định dạng ngày, hàng NET của component native cũ thấp hơn khoảng 12 px.
Không sửa component dùng chung và không khẳng định hai state mới khớp pixel. Hai state mới chưa chụp Android.

Bổ sung 26/10: `faceid-scanning` đổi vòng chờ thành tròn theo phản hồi máy thật; đã xem 8 frame từ video simulator, icon đứng yên. Đây là thay đổi có chủ đích so với vòng vuông bo góc của prototype. Không thay sheet PIN hay luồng xác thực.

## Chụp lại

```bash
# 1. Chạy Metro với cờ QA (bật deep link kavor://qa/<trạng thái>)
cd apps/mobile && LANG=en_US.UTF-8 EXPO_PUBLIC_KAVOR_QA=1 npx expo start --dev-client
# 2. Mở app dev build trên simulator "Kavor QA iPhone 11"
# 3. Chụp và ghép (từ thư mục gốc repo)
node tools/ui-compare/capture-prototype.mjs
python3 -I tools/ui-compare/capture-native.py
python3 -I tools/ui-compare/pair.py
python3 -I tools/ui-compare/manifest.py
```

Mỗi lệnh nhận thêm tên trạng thái để chụp riêng, ví dụ `python3 -I tools/ui-compare/capture-native.py home pin`.
Danh sách trạng thái và kịch bản dựng nằm ở `tools/ui-compare/states.mjs` (prototype) và `apps/mobile/src/qa.ts` (native). Hai file này phải giữ cùng tên.

## Giới hạn

- Ảnh native chụp trên simulator, chưa phải iPhone 11 thật. Animation, safe area, Face ID và navbar ẩn/hiện khi cuộn cần xác nhận lại trên máy thật.
- Ảnh tĩnh không đánh giá được chuyển động; xem video hoặc thao tác trực tiếp.
