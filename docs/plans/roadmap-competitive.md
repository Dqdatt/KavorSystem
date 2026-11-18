# Lộ trình cạnh tranh: Kavor cho doanh nghiệp vừa và nhỏ

> Viết bởi Claude ngày 06/11/2026, sau khi rà repo (PROGRESS, `docs/plans/payroll*.md`, trang web HR, migration đến `202611200001`)
> và so với những gì khách SME thường hỏi khi chọn HRM (MISA AMIS, Base, 1Office, Tanca). So sánh đối thủ dựa trên hiểu biết chung,
> **chưa khảo sát lại** tính năng/giá hiện tại của họ. Tài liệu định hướng, chưa phải kế hoạch chi tiết: mỗi giai đoạn khi bắt đầu
> viết kế hoạch riêng trong `docs/plans/` và làm theo khuôn module (`docs/AGENT_PLAYBOOK.md` mục 3).

> **18/11/2026 — người dùng chốt giữ làm định hướng sau v1** (mục 6, `docs/plans/hoan-thien-v1.md`). Phần "Hiện trạng" bên dưới đã cũ:
> Kavor đã tự tính lương (giai đoạn 1 phần lớn đã làm). Khi bắt đầu một giai đoạn, rà lại hiện trạng trước khi viết kế hoạch riêng.

## Định vị

**"HRM cho SME Việt Nam: dựng trong một ngày từ Excel, nhân viên hiểu từng con số, không lo sai luật."**

Không thắng đối thủ bằng độ rộng (tuyển dụng, KPI, đào tạo). Thắng bằng độ sâu và độ đúng của chuỗi
**chấm công → công → lương**, cộng với app nhân viên dùng được thật.

## Hiện trạng (06/11/2026)

**Đã có và hơn đối thủ ở cách làm**, cần đưa vào lời giới thiệu và kịch bản demo:

| Điểm mạnh | Cách nói với khách |
|---|---|
| Quy định theo tầng, có phiên bản và ngày hiệu lực (ADR 0001) | "Đổi quy chế giữa năm, tính lại tháng cũ vẫn đúng" |
| Chấm công/phiên bản lương/tài liệu bất biến, giải trình tạo điều chỉnh, nhật ký đầy đủ | "Không ai sửa công hay lương mà không để lại dấu vết" |
| Support access do quản trị viên công ty duyệt, có thời hạn | "Kavor không tự xem dữ liệu của anh" |
| Đồng ý dữ liệu cá nhân có phiên bản, số tài khoản che 4 số cuối | "Sẵn sàng cho luật bảo vệ dữ liệu cá nhân 2026" |
| App lưu chấm công trên máy trước rồi gửi, mở app hiện ngay, minh chứng đính kèm | "Nhân viên chịu dùng" |

**Lỗ hổng:** Kavor **chưa tự tính lương**. Kỳ lương đang ở chế độ `final_result_import`: công ty tính trong Google Sheets rồi nhập CSV kết quả.
Bảng lương đầu vào thì đã có (giai đoạn A, B của `payroll-inputs.md`). Với SME, tính lương là lý do mua HRM số một.

## Giai đoạn 1: Kavor tự tính lương (ưu tiên cao nhất)

Mục tiêu: khách bỏ Excel tính lương; mỗi con số trên phiếu lương giải thích được.

1. **Tham số luật do Kavor duy trì, có ngày hiệu lực.** Bảng cấp nền tảng, sửa ở Console: lương tối thiểu vùng, lương cơ sở,
   tỷ lệ BHXH/BHYT/BHTN (người lao động và doanh nghiệp), trần đóng, giảm trừ bản thân/người phụ thuộc, biểu thuế lũy tiến,
   khấu trừ 10% cho lao động thời vụ, đoàn phí. Tra theo ngày giống lịch lễ.
   Thay mức miễn thuế đang để công ty tự nhập (đang lệch ADR 0001, đã ghi trong `payroll-inputs.md`).
   Vùng lương tối thiểu gắn với địa điểm làm việc hoặc công ty: **cần quyết định**.
2. **Bộ tính lương tất định** trong API (giống `timesheet/compute.ts`): công + lương cứng/khoản phụ cấp (đã có) + OT theo hệ số (đã có)
   + phép có lương (đã có) → gross → BH (trên lương đóng BH, có trần) → thu nhập chịu thuế (trừ khoản miễn/không chịu thuế, giảm trừ)
   → thuế TNCN → đoàn phí → tạm ứng (đã có) → thực nhận. Unit test theo từng ca của mẫu bảng tính Kế toán thật.
   Mỗi dòng trả kèm phần giải thích (đầu vào, tham số, công thức).
3. **Kỳ lương tính trong Kavor**: thêm chế độ `computed` bên cạnh `final_result_import` (giữ chế độ nhập cho công ty có quy chế đặc thù).
   Tính từ bảng lương đầu vào đã chốt; Kế toán điều chỉnh từng dòng có lý do (không sửa ngầm); luồng duyệt/công bố dùng lại cái đang có.
4. **Phiếu lương có giải thích**: app chạm từng dòng xem cách tính; web Kế toán xem cùng phần giải thích.
5. **Chạy song song một kỳ**: nhập file kết quả Excel của khách, so từng nhân viên/từng dòng với bản Kavor tính, liệt kê chênh lệch.
   Đây là công cụ chốt bán và cũng là kiểm thử thật.
6. **Xuất file**: chi lương ngân hàng (bắt đầu 2–3 ngân hàng phổ biến), danh sách tăng/giảm BHXH (mẫu D02), dữ liệu quyết toán thuế TNCN.
   Bắt đầu bằng CSV/Excel theo mẫu; nộp trực tiếp lên cổng cơ quan nhà nước để sau.

Cần từ người dùng trước khi làm: mẫu bảng tính lương thật của Kế toán (đã ẩn số), danh sách khoản không chịu thuế đang dùng,
quy tắc công chuẩn (theo ngày công thực tế của tháng hay cố định 26), mẫu file ngân hàng muốn hỗ trợ trước.

Xong khi: một công ty mẫu tính trọn một kỳ trong Kavor, kết quả khớp bảng Excel của Kế toán (hoặc chênh lệch được giải thích),
nhân viên xem phiếu có giải thích trên app, xuất được file ngân hàng + D02.

## Giai đoạn 2: Hợp đồng và cảnh báo tuân thủ

Mục tiêu: HR không quên mốc pháp lý; Kavor "nhắc trước khi thanh tra nhắc".

- **Vòng đời hợp đồng**: loại, ngày bắt đầu/kết thúc, phụ lục, số lần ký xác định thời hạn; liên kết với Tài liệu (bản file).
  "Tạo từ mẫu" (đang thiếu ở module Tài liệu): soạn hợp đồng/quyết định từ mẫu của công ty, xuất file. **Không làm chữ ký số.**
- **Thử việc**: ngày hết thử việc, nhắc đánh giá, chuyển chính thức tạo phiên bản lương mới.
- **Bảng cảnh báo tuân thủ** (web HR + thông báo): hợp đồng sắp hết hạn, đã ký hai hợp đồng xác định thời hạn liên tiếp, thử việc quá hạn,
  OT sắp chạm trần tháng/năm (đã có số liệu ở `overtime`), lương đóng BH thấp hơn lương tối thiểu vùng (cần giai đoạn 1),
  nhân viên chưa có MST/chưa có tài khoản ngân hàng. Ngưỡng là tham số luật do Kavor duy trì.

## Giai đoạn 3: Mở rộng sang ngành xoay ca

Mục tiêu: phục vụ được F&B, bán lẻ, nhà xưởng (nhóm SME đông nhưng hiện chưa phục vụ được).

- **Xếp ca theo ngày/tuần**: lịch ca từng người từng ngày, đổi ca/nhận ca trống (có duyệt), xuất bản lịch, app nhân viên xem lịch.
  Bộ tính công đọc ca theo lịch nếu có, còn không thì theo ca áp theo tầng như hiện nay. Đổi `computeDay` phải có unit test.
- **Nhập log máy chấm công** (vân tay/khuôn mặt): nhập file log, khớp mã chấm công với nhân viên, lưu thành sự kiện nguồn `device_import`
  (vẫn bất biến). Kết nối trực tiếp máy để sau.

## Giai đoạn 4: Nghỉ việc trọn gói và báo cáo cho chủ doanh nghiệp

- **Nghỉ việc**: luồng một màn: ngày nghỉ, chốt công, phép tồn (thanh toán hoặc hủy theo quy định), tạm ứng chưa trừ, kỳ lương cuối,
  báo giảm BHXH, thu hồi tài khoản/thiết bị, tài liệu bàn giao. Đa số mảnh đã có, chỉ thiếu luồng gom lại.
- **Nhận việc**: checklist giấy tờ cần nộp, kích hoạt tài khoản, gán ca/địa điểm/vai trò.
- **Tổng quan cho chủ doanh nghiệp**: quỹ lương theo tháng/phòng ban, biến động nhân sự, đi muộn/vắng, OT, đơn đang kẹt.
  Chỉ người có quyền lương thấy số tiền.

## Giai đoạn 5: Kênh thông báo và AI

- **Push thật hoặc Zalo**: push APNs/FCM cần tài khoản Apple Developer trả phí. Zalo OA/ZNS hợp với nhân viên SME hơn email,
  nhưng **trước khi đăng ký phải kiểm điều kiện, chi phí, tiền tạm giữ** và nói rõ bản hiện tại đã đủ chưa. Việc ưu tiên trước:
  nhắc chấm công theo ca bằng thông báo cục bộ (đã có kế hoạch).
- **AI**: chỉ giải thích và gợi ý, **không tính toán, không tự duyệt**. Thứ tự:
  1. Trợ lý hỏi đáp trên app cho nhân viên ("còn mấy ngày phép", "vì sao lương bị trừ") dựa trên phần giải thích của giai đoạn 1
     và quy định đang hiệu lực, có trích nguồn, đi qua API có phân quyền.
  2. Đọc nội quy/quy chế lương (PDF/Word) → đề xuất cấu hình ca, phép, khoản phụ cấp, quy định giải trình; HR xem và bấm áp dụng.
  3. Nhận cột thông minh khi nhập file nhân viên/lương/log máy chấm công.
  4. HR hỏi bằng ngôn ngữ thường ("ai đi muộn quá 3 lần tháng này ở phòng Kinh doanh").
  5. Soạn nháp quyết định, thông báo, bản tin.

  Ràng buộc: dữ liệu lương, tài khoản ngân hàng, sức khỏe là dữ liệu nhạy cảm. Gửi sang API AI ở nước ngoài là chuyển dữ liệu xuyên biên giới,
  cần đánh giá tác động và điều khoản đồng ý riêng. AI nhận phần giải thích đã tính sẵn, bớt số tiền khi không cần, công ty tắt được hoàn toàn.

## Song song với mọi giai đoạn: dựng trong một ngày

- Nhập từ Excel/Google Sheets cho mọi thứ khách đang có: nhân viên (đã có), lương/khoản phụ cấp/người phụ thuộc (chưa có),
  số dư phép đầu kỳ, lịch sử hợp đồng.
- Checklist thiết lập ban đầu (đã có) dẫn đến tận "tính thử kỳ lương đầu tiên".
- Gói miễn phí cho công ty nhỏ (giới hạn nhân sự theo gói đã có ở `tenancy/plan.ts`): **quyết định kinh doanh, cần người dùng chốt**.

## Không làm trong lộ trình này

Tuyển dụng, KPI/OKR, đào tạo, chữ ký số, AI tự duyệt đơn/tự tính lương/chấm điểm nhân viên, AI "phát hiện gian lận chấm công"
(luật cứng về độ chính xác GPS, thiết bị, vị trí giả làm tốt hơn).

## Quyết định chờ người dùng

1. Đồng ý thứ tự giai đoạn 1 → 5?
2. Cung cấp mẫu bảng tính lương thật (đã ẩn số) để làm giai đoạn 1.
3. Vùng lương tối thiểu theo địa điểm làm việc hay theo công ty.
4. Ngân hàng nào cần file chi lương trước.
5. Có khảo sát lại đối thủ (tính năng, giá, đánh giá người dùng) trước khi chốt định vị không.
