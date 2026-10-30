/* Đọc và kiểm tra cấu hình lúc API khởi động: thiếu hoặc sai biến môi trường thì dừng ngay
   với thông báo rõ ràng, thay vì lỗi mơ hồ khi đang xử lý request. Không bao giờ in giá trị bí mật. */

export type AppEnv = "development" | "test" | "staging" | "production";

/* SMTP trực tiếp (dev: Mailpit) hoặc trạm gửi thư HTTPS trên web HR (Render Free chặn cổng SMTP — xem docs/DEPLOY.md) */
export type MailConfig = { kind: "smtp"; smtpUrl: string; from: string } | { kind: "relay"; url: string; secret: string };

export type AppConfig = {
  env: AppEnv;
  port: number;
  corsOrigins: string[];
  supabase: { url: string; serviceRoleKey: string } | null;
  /* Gửi thư mời kích hoạt; null = chưa cấu hình (API báo lỗi khi HR bấm gửi lời mời) */
  mail: MailConfig | null;
  /* Địa chỉ web HR/Admin ghi trong thư mời Tenant Admin (Kavor Console) */
  adminWebUrl: string;
  /* Địa chỉ Kavor Console ghi trong thư mời nhân viên Kavor */
  consoleWebUrl: string;
  /* Email được tự kích hoạt làm quản trị viên Console đầu tiên khi nền tảng chưa có quản trị viên nào (không cần chạy lệnh).
     Dev/test mặc định admin@kavor.test; staging/production phải đặt CONSOLE_BOOTSTRAP_EMAIL nếu muốn bật. */
  consoleBootstrap: { email: string; fullName: string } | null;
};

type Source = Record<string, string | undefined>;

const ENVS: AppEnv[] = ["development", "test", "staging", "production"];

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cấu hình API không hợp lệ:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

export function loadConfig(source: Source = process.env): AppConfig {
  const problems: string[] = [];
  const get = (key: string) => source[key]?.trim() || undefined;

  const env = (get("NODE_ENV") ?? "development") as AppEnv;
  if (!ENVS.includes(env)) problems.push(`NODE_ENV phải là một trong ${ENVS.join(", ")} (đang là "${env}")`);

  const rawPort = get("API_PORT") ?? get("PORT") ?? "4000"; /* PORT: cổng do nền tảng cloud (Render) cấp */
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`API_PORT phải là số cổng hợp lệ (đang là "${rawPort}")`);

  const corsOrigins = (get("API_CORS_ORIGINS") ?? "http://localhost:3000,http://localhost:3001").split(",").map((o) => o.trim()).filter(Boolean);
  for (const o of corsOrigins) {
    try { new URL(o); } catch { problems.push(`API_CORS_ORIGINS chứa địa chỉ không hợp lệ: "${o}"`); }
  }

  /* Supabase bắt buộc ở staging/production; ở development/test có thể chạy với dữ liệu mẫu */
  const url = get("SUPABASE_URL");
  const serviceRoleKey = get("SUPABASE_SERVICE_ROLE_KEY");
  const placeholder = !serviceRoleKey || serviceRoleKey.startsWith("replace-with");
  const required = env === "staging" || env === "production";
  let supabase: AppConfig["supabase"] = null;
  if (url || !placeholder) {
    if (!url) problems.push("Thiếu SUPABASE_URL");
    else {
      try {
        const u = new URL(url);
        if (required && u.protocol !== "https:") problems.push("SUPABASE_URL phải dùng https ở staging/production");
      } catch { problems.push("SUPABASE_URL không phải URL hợp lệ"); }
    }
    if (placeholder) problems.push("Thiếu SUPABASE_SERVICE_ROLE_KEY (hoặc vẫn là giá trị mẫu)");
    if (url && !placeholder) supabase = { url, serviceRoleKey: serviceRoleKey! };
  } else if (required) {
    problems.push("SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY là bắt buộc ở staging/production");
  }
  if (required && corsOrigins.some((o) => o.startsWith("http://localhost"))) problems.push("Không dùng origin localhost trong API_CORS_ORIGINS ở staging/production");

  const smtpUrl = get("SMTP_URL"), relayUrl = get("MAIL_RELAY_URL"), relaySecret = get("MAIL_RELAY_SECRET");
  let mail: AppConfig["mail"] = null;
  if (relayUrl) {
    try {
      const u = new URL(relayUrl);
      if (required && u.protocol !== "https:") problems.push("MAIL_RELAY_URL phải dùng https ở staging/production");
      if (!relaySecret || relaySecret.length < 32) problems.push("MAIL_RELAY_SECRET phải có ít nhất 32 ký tự khi dùng MAIL_RELAY_URL");
      else mail = { kind: "relay", url: relayUrl, secret: relaySecret };
    } catch { problems.push("MAIL_RELAY_URL không phải URL hợp lệ"); }
  } else if (smtpUrl) {
    try {
      const u = new URL(smtpUrl);
      if (!["smtp:", "smtps:"].includes(u.protocol)) problems.push("SMTP_URL phải bắt đầu bằng smtp:// hoặc smtps://");
      else mail = { kind: "smtp", smtpUrl, from: get("MAIL_FROM") ?? "Kavor <no-reply@kavor.vn>" };
    } catch { problems.push("SMTP_URL không phải URL hợp lệ"); }
  }

  const adminWebUrl = (get("ADMIN_WEB_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  try { new URL(adminWebUrl); } catch { problems.push(`ADMIN_WEB_URL không phải URL hợp lệ: "${adminWebUrl}"`); }

  const consoleWebUrl = (get("CONSOLE_WEB_URL") ?? "http://localhost:3001").replace(/\/+$/, "");
  try { new URL(consoleWebUrl); } catch { problems.push(`CONSOLE_WEB_URL không phải URL hợp lệ: "${consoleWebUrl}"`); }

  const bootstrapEmail = (get("CONSOLE_BOOTSTRAP_EMAIL") ?? (required ? undefined : "admin@kavor.test"))?.toLowerCase();
  if (bootstrapEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bootstrapEmail)) problems.push(`CONSOLE_BOOTSTRAP_EMAIL không phải email hợp lệ: "${bootstrapEmail}"`);
  const consoleBootstrap = bootstrapEmail ? { email: bootstrapEmail, fullName: get("CONSOLE_BOOTSTRAP_NAME") ?? "Quản trị Kavor" } : null;

  if (problems.length) throw new ConfigError(problems);
  return { env, port, corsOrigins, supabase, mail, adminWebUrl, consoleWebUrl, consoleBootstrap };
}
