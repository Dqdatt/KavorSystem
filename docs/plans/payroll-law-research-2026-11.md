# Rà soát luật lương – BHXH – thuế – công đoàn (10/11/2026)

> Claude tra ngày 10/11/2026 để kiểm lại các giả định trong `payroll-tenant-rules.md` và tham số luật đang lưu (`202611270001_payroll_law.sql`).
> Nguồn chủ yếu là bài phân tích (thuvienphapluat, luatvietnam, EY, BHXH TP.HCM qua báo PLO, cscltw.dcs.vn…), **chưa đọc được văn bản gốc**
> (thuvienphapluat chặn tải tự động). Mức tin cậy ghi ở từng dòng; mục "trung bình" cần người có chuyên môn hoặc văn bản gốc xác nhận trước khi
> đặt `verified: true`.

## A. Tham số luật Kavor đang lưu SAI hoặc THIẾU (ảnh hưởng kết quả tính hiện tại)

| # | Mục | Kavor đang có | Đúng theo tra cứu | Nguồn | Tin cậy |
|---|---|---|---|---|---|
| A1 | Đoàn phí (đoàn viên, DN ngoài nhà nước) | 1% lương đóng BHXH, trần 10% lương cơ sở | **0,5%** lương đóng BHXH, trần 10% lương cơ sở, **từ 01/07/2025** (QĐ 61/QĐ-TLĐ thay QĐ 1408). Đoàn viên không thuộc diện BHXH: mức cố định, tối thiểu 0,5% lương cơ sở. Đang hưởng trợ cấp BHXH / nghỉ không lương từ 1 tháng: không đóng | cscltw.dcs.vn, thuvienphapluat | Cao (nhiều nguồn khớp) — ví dụ của HR (35.000 = 0,5% × 7tr) **đúng** |
| A2 | Ngưỡng khấu trừ 10% (không HĐ / HĐ dưới 3 tháng) | 2.000.000/lần (cả bản 01/07/2026) | **5.000.000/lần từ 01/07/2026** (NĐ 253/2026/NĐ-CP, khoản 2 Điều 50, thay NĐ 65/2013). Dưới 5tr chỉ khấu trừ khi cá nhân yêu cầu | luatvietnam, MISA, APS | Cao về mức; ngày hiệu lực 1 nguồn ghi 01/01/2026 → cần văn bản gốc |
| A3 | Tiền ăn giữa ca | Công ty tự nhập mức miễn thuế (mặc định mẫu 730k) | Miễn thuế đến **1.200.000/người/tháng** từ 01/07/2026 (NĐ 253); bữa ăn do DN tự nấu/mua suất/phiếu ăn: không tính | luatvietnam (10 điểm mới NĐ 253) | Cao |
| A4 | Làm thêm giờ, làm đêm | Chỉ miễn phần chênh lệch so với giờ thường | Luật 109/2025: **tiền lương làm thêm giờ, làm đêm là thu nhập miễn thuế** (toàn bộ), phần vượt giới hạn giờ của luật lao động mới chịu thuế; áp dụng từ kỳ tính thuế 2026 với cá nhân cư trú; DN phải lập bảng kê giờ OT/đêm đã trả (NĐ 253 Điều 26) | EY, thuvienphapluat, APS | Trung bình–cao (một số bài diễn giải khác) |
| A5 | Tiền lương ngày phép không nghỉ | Chưa có | Miễn thuế trong mức Bộ luật Lao động (NĐ 253) | luatvietnam | Cao |
| A6 | Biểu thuế 5 bậc | 5/10/20/30/35% tại 10/30/60/100 triệu, `verified: false` | **Đúng** — đặt `verified: true` | EY | Cao |
| A7 | Giảm trừ 15,5tr / 6,2tr | Có | Đúng (NQ 110/2025/UBTVQH15, kỳ tính thuế 2026) | EY | Cao |
| A8 | Lương cơ sở / trần BHXH | 2.530.000 từ 01/07/2026, trần 50,6tr | Đúng (NĐ 161/2026/NĐ-CP ngày 15/5/2026); mức tham chiếu = lương cơ sở; **sàn** đóng BHXH = mức tham chiếu | thuvienphapluat | Cao |
| A9 | Kinh phí công đoàn (DN) | 2% luôn tính | Đúng: 2% quỹ lương đóng BHXH, **DN chưa có công đoàn cơ sở vẫn phải đóng** (NĐ 105/2026/NĐ-CP, từ 16/5/2026); chỉ miễn/giảm khi giải thể, thiên tai, cắt giảm lao động | easyhrm, cafef, thuvienphapluat | Cao |
| A10 | Trang phục | Chưa có | Hiện vật: miễn; tiền: miễn đến 5tr/người/năm | aztax | Trung bình |
| A11 | Xăng xe, điện thoại | Công ty tự chọn chịu thuế/miễn | Xăng xe cố định hằng tháng: **chịu thuế** (không phải công tác phí). Điện thoại: chỉ không tính khi khoán theo quy chế tài chính/quy chế nội bộ — các nguồn lệch nhau | thuvienphapluat, aztax | Trung bình |

**Lưu ý kỹ thuật:** phiên bản 01/07/2026 đã hiệu lực nên trigger không cho sửa. Sửa A1–A2 cần migration sửa dữ liệu có chủ đích (tạm bỏ guard trong
migration, ghi chú lý do) — không tạo "phiên bản mới" trùng ngày. Thêm bản 01/07/2025 không cần (Kavor chưa có kỳ lương trước 2026).

## B. Kiểm lại các ý người dùng đưa ra (10/11)

| Ý | Kết luận | Ghi chú |
|---|---|---|
| 1. Thử việc 85% lương cứng, không phụ cấp "theo luật" | **Đúng về con số, sai về "theo luật"** | BLLĐ 2019 Điều 26: lương thử việc **ít nhất 85%** "tiền lương của công việc đó"; Điều 90: tiền lương gồm mức lương + phụ cấp + khoản bổ sung. Luật không bắt bỏ phụ cấp. Cách tính 85% × lương cứng (đã gồm phụ cấp) là cách **an toàn**; trả 85% lương cơ bản rồi bỏ phụ cấp mới có rủi ro dưới sàn. Trả dưới 85% bị phạt hành chính. |
| 2. Đoàn phí công ty tự nhập % | **Nên đổi** | Đoàn phí do Tổng LĐLĐ quy định chung (0,5%), không phải công ty tự đặt. Kavor duy trì tỷ lệ; công ty chỉ bật "có công đoàn cơ sở/thu đoàn phí" + đánh dấu đoàn viên. Cho ghi đè chỉ khi có lý do (và cảnh báo). |
| 3. Công chuẩn theo lịch (T2–T6 hoặc có T7) | **Đúng** | Luật không định nghĩa công chuẩn — do quy chế công ty. Công thức phổ biến: số ngày trong tháng − ngày nghỉ hằng tuần; **nhiều nơi trừ nửa ngày T7** → Kavor nên hỗ trợ T7 nửa ngày. Ngày lễ hưởng nguyên lương (Điều 112) **tính vào công thực tế** (đã đưa vào kế hoạch). |
| 4. Thực tập trên 2tr khấu trừ 10% | **Đã lỗi thời** | Từ 01/07/2026 ngưỡng là **5tr/lần**. Chỉ áp cho người không ký HĐLĐ hoặc HĐ dưới 3 tháng. Có cam kết 08/CK-TNCN (thu nhập cả năm dưới mức chịu thuế, có MST) thì không khấu trừ. |
| 5. Phụ cấp cố định đóng BH, không cố định không đóng | **Người dùng đúng hơn Claude** — Claude rút lại góp ý trước | Luật BHXH 2024 Điều 31 + NĐ 158/2025 Điều 7: căn cứ đóng = mức lương + phụ cấp lương + **khoản bổ sung xác định được mức tiền, thỏa thuận trong HĐLĐ, trả thường xuyên, ổn định mỗi kỳ**; khoản phụ thuộc năng suất/chất lượng công việc thì không. BHXH TP.HCM (12/2025) trả lời: tiền ăn giữa ca, điện thoại **cố định ghi trong HĐLĐ, trả đều thì phải đóng**. Một số bài còn dẫn danh sách loại trừ của TT 10/2020 (luật cũ) → các nơi hiểu khác nhau. |
| Thử việc không đóng BH | **Tùy loại hợp đồng** | Hợp đồng thử việc riêng: không thuộc diện BHXH bắt buộc. Thử việc **ghi trong HĐLĐ** (từ 1 tháng): phải đóng ngay từ thời gian thử việc. Thuế cũng theo đó: HĐ từ 3 tháng (kể cả thời gian thử việc) → biểu lũy tiến; HĐ thử việc riêng/dưới 3 tháng → 10% nếu từ 5tr. |
| Không hưởng lương từ 14 ngày → không đóng BH | **Vẫn đúng** (Luật 2024 Điều 33 khoản 5) | Mới: hai bên được **thỏa thuận vẫn đóng** trong tháng đó → cần cờ theo nhân viên/tháng (để sau). |
| Hệ quả với ví dụ của HR | **Cần báo HR** | Nếu cơm trưa 730k, điện thoại 1,5tr, xăng xe 770k được ghi cố định trong HĐLĐ và trả đều, theo cách hiểu của BHXH TP.HCM thì lương đóng BHXH phải là **10tr**, không phải 7tr. Ví dụ của HR là cách làm phổ biến nhưng có rủi ro truy thu. Kavor không quyết thay công ty, nhưng phải cảnh báo. |

## C. Giấy tờ hồ sơ

- Luật không có danh mục hồ sơ bắt buộc (do công ty quy định) → danh mục theo công ty là đúng hướng.
- BLLĐ Điều 17: **cấm giữ bản chính** giấy tờ tùy thân, văn bằng, chứng chỉ → checklist ghi "đã nộp bản sao / đã đối chiếu bản chính", không có trạng thái "giữ bản gốc".
- Luật Bảo vệ dữ liệu cá nhân 2025 (Luật 91/2025/QH15, hiệu lực 01/01/2026; NĐ 356/2025): chỉ thu thập đúng mục đích tuyển dụng/quản lý; **xóa dữ liệu khi chấm dứt HĐLĐ** trừ khi luật khác yêu cầu giữ hoặc có thỏa thuận; ứng viên không trúng tuyển phải xóa. → Mỗi mục checklist có ghi chú mục đích; khi nhân viên nghỉ việc, Kavor nhắc HR xử lý bản sao giấy tờ (giữ những gì luật buộc lưu, như hồ sơ BHXH/thuế). Chi tiết thời hạn lưu: chưa tra được, cần văn bản gốc.

## Nguồn

- Đoàn phí 0,5%: [cscltw.dcs.vn](https://cscltw.dcs.vn/web/guest/xa-hoi/tong-lien-doan-lao-dong-viet-nam-dieu-chinh-muc-dong-doan-phi-cong-doan.html), [thuvienphapluat](https://thuvienphapluat.vn/phap-luat/muc-dong-doan-phi-cong-doan-2026-la-bao-nhieu-quy-dinh-muc-dong-doan-phi-cong-doan-moi-nhat-nhu-the-350875-249778.html)
- KPCĐ 2%: [easyhrm](https://easyhrm.vn/tin-tuc/kinh-phi-cong-doan/), [cafef](https://cafef.vn/doanh-nghiep-khong-lap-cong-doan-van-phai-dong-quy-2-chuyen-gia-luu-y-3-hieu-nham-de-khien-smes-gap-rui-ro-188260522081312543.chn)
- NĐ 253/2026: [luatvietnam – 10 điểm mới](https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-253-2026-nd-cp-ve-thue-thu-nhap-ca-nhan-565-110102-article.html), [luatvietnam – ngưỡng 5tr](https://luatvietnam.vn/tin-van-ban-moi/chinh-thuc-nang-nguong-khau-tru-thue-thu-nhap-vang-lai-len-5-trieu-dong-lan-tu-01-7-2026-186-110066-article.html), [APS](https://aps-audit.vn/nang-nguong-khau-tru-thue-tncn-10-len-5-trieu-dong-lan-chi-tra-theo-nghi-dinh-253-2026-nd-cp/)
- OT miễn thuế: [thuvienphapluat](https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/nghi-dinh-2532026-khong-phai-moi-khoan-tien-luong-lam-them-gio-deu-duoc-mien-thue-tncn-228226.html), [APS](https://aps-audit.vn/hieu-dung-ve-mien-thue-tncn-doi-voi-tien-lam-them-gio-tu-nam-2026-diem-khac-biet-so-voi-quy-dinh-cu/)
- Luật 109/2025 (biểu thuế, giảm trừ): [EY](https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/luat-thue-thu-nhap-ca-nhan-109-2025-qh15)
- Lương cơ sở 2026: [thuvienphapluat](https://thuvienphapluat.vn/lao-dong-tien-luong/tu-172026-tien-luong-dong-bhxh-toi-da-la-bao-nhieu-60882.html)
- Căn cứ đóng BHXH: [thuvienphapluat – Luật BHXH 2024](https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/chinh-sach-moi/67572/tien-luong-lam-can-cu-dong-bhxh-bat-buoc-theo-luat-bao-hiem-xa-hoi-2024), [BHXH TP.HCM qua PLO](https://tuoitre.vn/plo/tien-an-giua-ca-phu-cap-dien-thoai-co-dinh-co-phai-tinh-de-dong-bhxh-post888735.html), [lsvn](https://lsvn.vn/cac-khoan-bo-sung-tra-theo-luong-co-phai-tinh-dong-bao-hiem-xa-hoi-a165932.html)
- Thử việc và BHXH: [xcyber](https://xcyber.vn/hop-dong-thu-viec-va-bao-hiem-xa-hoi/), [thuvienphapluat](https://thuvienphapluat.vn/lao-dong-tien-luong/thu-viec-3-thang-co-phai-dong-bhxh-khong-51663.html)
- 14 ngày không lương: [luatvietnam](https://luatvietnam.vn/lao-dong-tien-luong/nguoi-lao-dong-nghi-tu-14-ngay-tro-len-trong-thang-562-25394-article.html), [lsvn](https://lsvn.vn/nguoi-lao-dong-can-lam-gi-de-dam-bao-quyen-loi-khi-nghi-khong-luong-tu-14-ngay-tro-len-a174637.html)
- Lương thử việc 85%: [thuvienphapluat](https://thuvienphapluat.vn/lao-dong-tien-luong/luong-thu-viec-toi-thieu-nam-2026-la-bao-nhieu-590666-59992.html)
- Công chuẩn, ngày lễ: [thuvienphapluat](https://thuvienphapluat.vn/lao-dong-tien-luong/ngay-nghi-le-co-duoc-tinh-vao-ngay-cong-trong-thang-khong-57056.html), [hoatieu](https://hoatieu.vn/phap-luat/quy-dinh-ngay-cong-chuan-cua-thang-205323)
- Thuế phụ cấp: [thuvienphapluat – xăng xe](https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/doi-voi-phu-cap-xang-xe-ho-tro-nhan-vien-thi-co-tinh-thue-tncn-theo-nghi-dinh-2532026ndcp-khong-228964.html), [aztax](https://aztax.com.vn/cac-khoan-phu-cap-khong-tinh-thue-tncn/)
- Giữ bản chính: [luatvietnam](https://luatvietnam.vn/lao-dong-tien-luong/cong-ty-giu-bang-goc-cua-nhan-vien-562-89355-article.html); dữ liệu cá nhân: [lsvn](https://lsvn.vn/tu-nam-2026-doanh-nghiep-phai-xoa-du-lieu-ca-nhan-cua-nguoi-lao-dong-khi-nghi-viec-a167358.html), [lsvn](https://lsvn.vn/nhung-du-lieu-doanh-nghiep-khong-duoc-thu-thap-khi-tuyen-dung-quan-ly-nhan-su-a169304.html)
