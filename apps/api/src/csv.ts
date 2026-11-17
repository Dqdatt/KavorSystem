/* Chặn CSV formula injection khi Kế toán mở bằng Excel: ô bắt đầu bằng = + - @ tab CR thì thêm ' ở đầu; số thuần (kể cả số âm) giữ nguyên. */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /["\r\n,;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
