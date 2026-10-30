# Triển khai bản online để thử (miễn phí)

Mục tiêu: chấm công trên iPhone bằng 4G mà không cần bật Mac. Chỉ dùng **dữ liệu thử** (dữ liệu nằm ở Singapore — chưa đánh giá theo
Nghị định 13/2023), gói miễn phí không dùng cho khách thật (Vercel Hobby chỉ phi thương mại).

| Phần | Dịch vụ | Ghi chú |
|---|---|---|
| CSDL, đăng nhập, file | Supabase Free (Singapore) | Tạm dừng nếu 7 ngày không có truy vấn — bật lại trên Dashboard |
| API | Render Free (Singapore), `render.yaml` | Ngủ sau 15 phút không ai gọi, thức dậy ~1 phút → bước 6 giữ thức |
| Web HR + Console | Vercel Hobby (2 project) | |
| Email OTP + thư mời | Gmail SMTP (mật khẩu ứng dụng) | ~500 thư/ngày |

Nếu bất kỳ dịch vụ nào đòi thẻ hoặc giữ tiền: **dừng lại**, không nhập thẻ.

Code triển khai từ nhánh `claude/ecstatic-pascal-dblg7v` (repo `Dqdatt/KavorSystem` đang để **công khai** — không bao giờ commit khóa;
mọi khóa chỉ nhập trên Dashboard của từng dịch vụ). Khi merge vào `main` thì đổi nhánh ở `render.yaml` và Vercel.

## 1. Gmail: mật khẩu ứng dụng
1. Tài khoản Google phải bật Xác minh 2 bước.
2. https://myaccount.google.com/apppasswords → tên "Kavor" → chép mật khẩu 16 ký tự (bỏ dấu cách). Chỉ dán vào Render và lúc chạy script ở bước 5.

## 2. Supabase: project mới
1. https://supabase.com → đăng nhập bằng GitHub → New project: tên `kavor-dev`, Region **Southeast Asia (Singapore)**, đặt mật khẩu DB
   (lưu lại, cần ở bước 5), gói Free. Project cũ `KavorSystem` (key cũ nằm trong lịch sử repo công khai) nên xóa.
2. Ghi lại (Project Settings):
   - General → **Reference ID** → `SUPABASE_PROJECT_REF`
   - Data API → **Project URL** (`https://<ref>.supabase.co`) → `SUPABASE_URL`
   - API Keys → **Publishable key** (cho web) và **Secret key** (chỉ cho API, giữ kín)

## 3. Vercel: hai project web
https://vercel.com → đăng nhập GitHub → Add New → Project → chọn repo `KavorSystem`, làm **hai lần**:

| | Web HR | Console |
|---|---|---|
| Project name | `kavor-hr` | `kavor-console` |
| Root Directory | `apps/admin-web` | `apps/console-web` |
| Biến môi trường | `KAVOR_API_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ENABLE_EXPERIMENTAL_COREPACK=1` | `KAVOR_API_URL`, `ENABLE_EXPERIMENTAL_COREPACK=1` |

- `KAVOR_API_URL` = `https://kavor-api.onrender.com/api/v1` (đoán trước tên ở bước 4; nếu Render cấp tên khác thì sửa lại và Redeploy).
- Lúc đăng ký chọn **"I'm working on personal projects" (Hobby)** — mặc định đang chọn Pro (bắt đầu dùng thử trả phí).
- Đăng nhập Vercel bằng GitHub `Dqdatt` (chủ repo); email tài khoản Vercel tùy ý. Không import bằng URL (tạo bản sao, không tự cập nhật).
- Sau khi tạo: Settings → Environments → Production → Branch Tracking = `claude/ecstatic-pascal-dblg7v` → Save. Nút "Redeploy" báo "No deployments
  found" khi nhánh chưa có bản nào → push một commit lên nhánh (Vercel tự deploy Production) hoặc Deployments → Create Deployment.
- Ghi lại hai địa chỉ, ví dụ `https://kavor-hr.vercel.app`, `https://kavor-console.vercel.app`.

## 4. Render: API
https://render.com → đăng nhập GitHub → New → **Blueprint** → chọn repo (đọc `render.yaml`). Nhập các biến:

| Biến | Giá trị |
|---|---|
| `SUPABASE_URL` | Project URL ở bước 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key ở bước 2 |
| `API_CORS_ORIGINS` | `https://kavor-hr.vercel.app,https://kavor-console.vercel.app` |
| `ADMIN_WEB_URL` / `CONSOLE_WEB_URL` | hai địa chỉ Vercel |
| `SMTP_URL` | `smtp://<gmail>:<mật khẩu ứng dụng>@smtp.gmail.com:587` (ký tự `@` trong email viết `%40`) |
| `MAIL_FROM` | `Kavor <địa chỉ gmail>` |
| `CONSOLE_BOOTSTRAP_EMAIL` | email của bạn — quản trị Console đầu tiên |

Kiểm: mở `https://kavor-api.onrender.com/api/v1/health` → có `"status"`. API thiếu biến/còn localhost sẽ không khởi động (xem Logs).

## 5. Đẩy CSDL + cấu hình đăng nhập lên Supabase (trên Mac)
```bash
supabase login
SUPABASE_PROJECT_REF=<ref> ADMIN_WEB_URL=https://kavor-hr.vercel.app CONSOLE_WEB_URL=https://kavor-console.vercel.app GMAIL_USER=<gmail> bash tools/cloud-supabase.sh
```
Script hỏi mật khẩu ứng dụng Gmail và mật khẩu DB; áp toàn bộ migration (không có dữ liệu mẫu) và cấu hình Auth (tắt đăng ký công khai,
OTP 6 số/5 phút, MFA, mẫu email). Thử trước không đụng cloud: thêm `DRY_RUN=1`. CLI 2.108 có thể báo `failed to read Storage config … databasePoolMode` sau
khi Auth đã "up to date": khi đó dán mẫu email bằng tay — Authentication → Emails → Templates → **Magic Link**, Subject `Mã xác thực Kavor`,
nội dung lấy bằng `pbcopy < supabase/templates/otp.html` (phải có `{{ .Token }}`: mẫu mặc định chỉ gửi link, không có mã 6 số). Sau đó trên Dashboard kiểm Authentication → Sign In /
Providers: **Allow new users to sign up = tắt**. Mỗi lần có migration mới: chạy lại script.

## 6. Giữ API luôn thức
https://cron-job.org (miễn phí) → tạo job gọi `https://kavor-api.onrender.com/api/v1/health` **mỗi 10 phút**. API thức thì vòng quét
10 phút của nó cũng truy vấn DB, nên Supabase không bị tạm dừng.

## 7. App iPhone
Build Release với `EXPO_PUBLIC_API_URL=https://kavor-api.onrender.com/api/v1` (lệnh trong PROGRESS "Cài bản mới lên iPhone"; xóa
`$TMPDIR/metro-cache` trước, không bật QA). App ký bằng Apple ID miễn phí hết hạn sau 7 ngày — cắm Mac cài lại.

## 8. Thử từ đầu
Console (`CONSOLE_WEB_URL`) → Kích hoạt tài khoản bằng `CONSOLE_BOOTSTRAP_EMAIL` (OTP về Gmail) → tạo công ty → quản trị viên công ty kích
hoạt trên web HR → tạo ca, địa điểm (tọa độ lấy bằng GPS điện thoại tại chỗ) → **Áp dụng** → nhân viên kích hoạt trên app → chấm công.
Chi tiết: `docs/TEST_WORKFLOW.md`.

## Giới hạn đã biết
- Render Free có thể khởi động lại bất chợt: liên kết tải file 5 phút tạo trước đó hết hiệu lực sớm; lần gọi đầu sau khi ngủ chậm ~1 phút.
- 750 giờ Render/tháng chỉ đủ cho **một** dịch vụ chạy suốt — không thêm dịch vụ Render khác.
- Bản đồ chọn vị trí dùng máy chủ cộng đồng (tile.openstreetmap.de + Photon) — đủ để thử, chưa dùng cho khách.
- Smoke/verify-all vẫn chạy trên Supabase local của Mac, không bao giờ trỏ vào cloud.
