# Cách làm việc trong dự án Kavor (cho Codex, Claude và người mới)

Tài liệu này ghi lại quy trình đã cho kết quả ổn định ở các module auth, chấm công, công tháng, nghỉ phép, OT, tạm ứng
(mỗi module: chạy được đầu-cuối trên iPhone thật, ít lỗi phải sửa lại). Nó **bắt buộc** với mọi agent làm việc trong repo.
Lý do tồn tại: giai đoạn 20–21/10 có 6 commit liên tiếp "align / refine / finalize prototype parity" mà app vẫn lệch prototype;
chỉ khi đổi sang cách làm dưới đây (port nguyên văn + đối chiếu ảnh từng trạng thái) mới xong trong một lần (`c60232d`).

---

## 1. Năm nguyên tắc

1. **Đọc trước, viết sau.** Trước khi sửa một file phải đọc file đó (và file nó gọi tới). Trước khi làm module phải đọc
   `PROGRESS.md`, `AGENTS.md`, phần tương ứng trong `PILOT_RULEBOOK.md`, `DATABASE_SCHEMA.md`, `PERMISSION_MATRIX.md`, ADR, và
   đoạn prototype của màn đó. Không đoán API, tên cột, tên hàm — mở ra xem.
2. **Không nói "xong" khi chưa có bằng chứng.** "Xong" = đã chạy lệnh kiểm tra và dán kết quả (typecheck, test, smoke, ảnh chụp).
   Chưa kiểm được thì ghi rõ "chưa kiểm tra: …". Không bao giờ báo đạt khi test fail.
3. **Bước nhỏ, mỗi bước kiểm ngay.** Sửa một phần → typecheck/test phần đó → mới sang phần sau. Không viết 10 file rồi mới chạy.
4. **Sửa nguyên nhân, không vá triệu chứng.** Lỗi lặp lại sau 2 lần sửa = đang đoán. Dừng lại, đo (log, query DB, curl API,
   chụp màn hình, đọc tài liệu thư viện), tìm nguyên nhân rồi mới sửa. Nếu các bản vá chồng lên nhau làm rối thì `git diff`
   và quay về trạng thái tốt gần nhất thay vì vá tiếp.
5. **Bám cái đã có.** Tìm module tương tự đã làm và làm theo đúng khuôn (đặt tên, cấu trúc, mật độ comment, cách báo lỗi).
   Không tự đặt khuôn mới, không "cải tiến" code không liên quan tới yêu cầu.

---

## 2. Chuyển prototype HTML → app native (phần hay hỏng nhất)

Prototype chuẩn: `Kavor HRM Prototype.html`. Code mobile: `apps/mobile/src/` (đã port 1:1 — sửa tiếp chứ không viết lại).

**Port nguyên văn, không "lấy cảm hứng":**
- Mở HTML/CSS/JS của đúng màn đó trong prototype, đọc hết trước khi viết. Ghi ra: danh sách phần tử theo thứ tự, chữ hiển thị,
  số liệu, trạng thái (state) và hành vi khi bấm.
- Chép **giá trị**, không ước lượng: màu hex, cỡ chữ, line-height, font-weight → `F.*`, bo góc, padding/margin, gradient,
  shadow, khoảng cách. 1 px CSS = 1 pt React Native ở kích thước 390×844 (iPhone 11 logic).
- Chữ tiếng Việt chép đúng từng ký tự, kể cả dấu "·", "–", "→".
- Dùng lại component sẵn có trong `src/ui.tsx`, `src/screen.tsx`, màu/kính trong `src/theme.ts`. Không tạo component trùng chức năng.
- State/hành vi đi qua `src/store.ts` (`S`, `ACT`, `go`, `openSheet`) như các màn khác — không giữ state riêng trong component trừ hiệu ứng.

**Mỗi màn/trạng thái một vòng, có đối chiếu ảnh:**
1. Thêm/kiểm trạng thái trong `tools/ui-compare/states.mjs` và `apps/mobile/src/qa.ts` (cùng tên).
2. Chụp prototype: `node tools/ui-compare/capture-prototype.mjs <state>`.
3. Chụp native (bản QA, simulator iPhone 11): `python3 -I tools/ui-compare/capture-native.py <state>`.
4. Ghép: `python3 -I tools/ui-compare/pair.py <state>` → mở ảnh trong `docs/ui-comparison/paired/` và **nhìn**.
5. Liệt kê từng điểm lệch (vị trí, cỡ, màu, chữ). Sửa. Chụp lại. Lặp tới khi chỉ còn lệch do font render/thanh trạng thái.
6. Ghi kết quả vào `docs/ui-comparison/manifest.*` (`python3 -I tools/ui-compare/manifest.py`). Trạng thái chưa làm phải ghi rõ, không bỏ.

**Không được:**
- Sửa component dùng chung (`ui.tsx`, `theme.ts`, `screen.tsx`) để chữa một màn rồi không chụp lại các màn khác — đổi chung thì
  chụp lại **toàn bộ** 70 trạng thái.
- Viết lại cả file/màn khi chỉ lệch vài chỗ.
- Báo "khớp prototype" dựa trên đọc code. Chỉ ảnh ghép mới là bằng chứng; ảnh simulator chưa phải máy thật (animation, safe area,
  Face ID, navbar ẩn/hiện phải nhờ người dùng xác nhận trên iPhone).

**Cạm bẫy đã gặp** (chi tiết trong `AGENTS.md` mục "Cạm bẫy"): Android cắt chữ khi nạp font lúc chạy (font nhúng native + NBSP
cuối chuỗi + `numberOfLines={1}`), `EXPO_PUBLIC_*` bị Metro cache (xóa `$TMPDIR/metro-cache`), `expo prebuild` xóa
`DEVELOPMENT_TEAM`/Pods, Debug iOS crash khi lệch flavor prebuilt (chụp QA bằng bản Release có cờ), `pod install` cần
`LANG=en_US.UTF-8`.

---

## 3. Làm một module nghiệp vụ (khuôn đã dùng cho chấm công → tạm ứng)

Thứ tự, mỗi bước kiểm xong mới sang bước sau:

1. **Chốt phạm vi** từ rulebook/schema/quyền/prototype: làm gì, để sau gì, giá trị mặc định lấy từ đâu (luật → ghi "cần chuyên gia
   xác nhận"). Ghi phạm vi vào câu trả lời trước khi code.
2. **Migration** `supabase/migrations/<ngày>_<tên>.sql`: permission + gán role; bảng mới bật RLS + policy + `grant select … to
   authenticated`; dữ liệu nghiệp vụ quan trọng **bất biến** (trigger chặn update/delete); thao tác nhiều bảng làm trong **một hàm
   SQL** (nguyên tử); mẫu mặc định cho tenant mới qua `tenant_policy_templates` + `provision_*`; seed cập nhật nếu cần.
   Áp: `supabase migration up` (giữ dữ liệu) hoặc `bash tools/db-reset.sh`.
3. **pgTAP** `supabase/tests/<module>.test.sql`: bất biến, quyền/RLS, hàm nguyên tử, ca lỗi. Không giả định DB trống; đọc phiên bản
   mẫu đầu tiên (`order by version_no limit 1`) thay vì "mới nhất". Chạy `supabase test db`, đọc dòng `Result:` (mã thoát có thể
   lỗi do telemetry).
4. **Contracts** `packages/contracts/src/index.ts`: kiểu dùng chung API ↔ web ↔ mobile. Typecheck cả 3 sau khi đổi.
5. **API** `apps/api/src/<module>/`: kiểm quyền + phạm vi ở mọi request, ngoài phạm vi trả 404, ghi audit; quy định tra theo tầng +
   theo ngày (`PolicyIndex`); "hôm nay" theo múi giờ tenant (`tenantClock`, không dùng `toISOString().slice(0,10)` hay
   `current_date`). API chạy bằng `tsx` không tự tải lại → **khởi động lại** (`bash tools/dev-backend.sh`) sau khi sửa.
6. **Smoke** `tools/<module>-smoke.sh`: kịch bản đầu-cuối qua API thật, có ca lỗi; không phụ thuộc ngày chạy. Chạy trên DB vừa reset.
7. **Web HR** `apps/admin-web/app/(app)/…`: bám trang prototype HR nếu có, phần không có ghi "thiết kế bổ sung"; kiểm trên trình duyệt.
8. **Mobile**: nhánh `REMOTE` đọc API, nhánh mẫu/QA giữ nguyên prototype. Không thêm giá trị nghiệp vụ cứng.
9. **Kiểm thử tổng**: `bash tools/verify-all.sh` (typecheck, unit test, pgTAP, **mọi** smoke trên DB mới, build, lint DB).
   Không chạy lẻ rồi suy ra "chắc ổn" — ngày 25/10 chỉ chạy test API nên sót một test contracts hỏng.
10. **iPhone**: build Release với IP LAN hiện tại (`ipconfig getifaddr en0`), cài bằng `xcrun devicectl`, đưa người dùng kịch bản thử
    cụ thể (bấm gì, phải thấy gì). Người dùng xác nhận rồi mới ghi "đã thử trên máy thật".
11. **PROGRESS.md** + commit (chỉ file của mình). Push chỉ khi người dùng bảo.

---

## 4. Nhiều agent (Codex, Claude) cùng một repo — tránh xung đột

Dự án chuyển qua lại giữa các agent. Mỗi lần chỉ **một** agent làm, theo thứ tự:

1. **Bắt đầu phiên**: `git status` phải sạch (còn file dở của người trước → hỏi người dùng, không tự xóa/ghi đè);
   `git pull`; đọc `PROGRESS.md` (mục "Đang dở" và "Bước tiếp theo"), kế hoạch trong `docs/plans/` nếu có.
2. **Ghi tên mình** vào đầu mục "Đang dở" của `PROGRESS.md`: `Đang làm: <Codex|Claude> — <việc> — từ <ngày giờ>`.
3. **Làm trên `main`** như các module trước (người dùng không dùng nhánh/PR). Commit nhỏ, mỗi commit đều qua
   `bash tools/verify-all.sh --quick`; trước khi bàn giao chạy bản đầy đủ `bash tools/verify-all.sh`.
4. **Không viết lại lịch sử**: không `push --force`, không `rebase`/`reset` commit đã push, không `stash` đồ của người khác.
5. **Migration đã push là bất biến**: không sửa/xóa file trong `supabase/migrations/` đã có trên `origin/main` (kiểm bằng
   `git log origin/main -- <file>`); cần đổi thì tạo migration mới (`create or replace function …`, `alter table …`).
6. **Đổi chỗ dùng chung thì kiểm mọi nơi dùng**: `packages/contracts` → typecheck api + admin-web + console-web + mobile;
   hàm SQL dùng chung (`create_request`, `decide_approval`, `notify*`, `task_assignees`, `request_label`) → chạy mọi smoke;
   `supabase/seed.sql` → các smoke dựa vào dữ liệu mẫu (HD0142, HDG0003, HD0007, HD0215, kỳ công 26→25).
7. **Kết thúc phiên**: cập nhật `PROGRESS.md` (Đã xong / Đang dở / Vấn đề / Bước tiếp theo / Nhật ký), xóa dòng "Đang làm",
   commit; push chỉ khi người dùng bảo. Ghi rõ trạng thái DB local (đã reset? đang có dữ liệu thử trên iPhone?) và IP API.

## 5. Báo cáo cho người dùng

- Tiếng Việt. Mở đầu bằng kết quả (đã làm gì, commit nào), rồi cách kiểm tra + kết quả thật, rồi cái **chưa làm / chưa kiểm**.
- Quyết định kỹ thuật tự đưa ra thì nói rõ là mình quyết và vì sao; quyết định sản phẩm/chi phí thì hỏi.
- Phát hiện lỗi cũ ngoài phạm vi: báo, đề xuất sửa, không lặng lẽ sửa lan man.
- Không đưa key/token/mật khẩu vào tài liệu, commit hay câu trả lời.

---

## 6. Mẫu giao việc (người dùng dán cho Codex)

```text
Đọc AGENTS.md, docs/AGENT_PLAYBOOK.md, PROGRESS.md (và docs/plans/<module>.md nếu có) trước.
Việc: <mô tả ngắn>.
Phạm vi: <màn/route/module>; ngoài phạm vi: <…>.
Xong khi: <tiêu chí kiểm được — ví dụ: ảnh ghép prototype ↔ native của trạng thái X, Y không còn lệch bố cục;
  typecheck mobile sạch; smoke Z đạt>.
Mỗi bước: dán lệnh kiểm tra đã chạy và kết quả; trước khi báo xong chạy `bash tools/verify-all.sh` và dán kết quả. Sửa cùng một lỗi 2 lần chưa được thì dừng, báo nguyên nhân nghi ngờ và hỏi.
Không commit/push nếu tôi chưa bảo.
```
