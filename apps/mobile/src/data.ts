/* Kiểu dữ liệu, cấu hình và hàm định dạng dùng chung. Dữ liệu mẫu nằm ở src/api/mock.ts */
import type { IconName } from "./icons";

export type ReqStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ReqType = "leave" | "explain" | "ot" | "advance" | "profile";
export type MyReq = { id: string; type: ReqType; title: string; sub: string; status: ReqStatus; created: string; reason: string; note?: string; adv?: boolean };
export type Approval = { id: string; who: string; ini: string; role: string; type: ReqType; title: string; sub: string; reason: string; ctx: string; created: string };
export type OctDay = { d: number; in?: string | null; out?: string | null; leave?: boolean; explained?: string; fix?: string; ot?: string; today?: boolean; pendingEx?: boolean };
export type Payslip = { k: string; pub: string; paid: string; work: string; income: Array<[string, number, string?]>; deduct: Array<[string, number, string?]> };
export type NewsCat = "policy" | "notice" | "event";
export type News = { id: number; cat: NewsCat; pin?: boolean; important?: boolean; title: string; date: string; by: string; read: string; file?: string; body: Array<string | string[]> };

export const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (sec: number) => `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor((sec % 3600) / 60))}`;
export const hms = (sec: number) => `${hm(sec)}:${pad(sec % 60)}`;
export const vnd = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
export const dec = (n: number) => String(n).replace(".", ",");
export const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} giờ${min % 60 ? ` ${min % 60} phút` : ""}` : `${min} phút`);
export const gh = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const toMin = (t: string) => { const [a = 0, b = 0] = t.split(":").map(Number); return a * 60 + b; };
export const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const WDF = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export const wdOct = (d: number) => (3 + d) % 7;
export const wdNov = (d: number) => (d - 1) % 7;
export const groupThousands = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const SALARY = 15000000;
export const ADV_PCT = 0.3;
export const ADV_DAY = 20;
export const advLimit = () => Math.round(SALARY * ADV_PCT);




export const TYPE_ICON: Record<ReqType, IconName> = { leave: "plane", explain: "clock", ot: "moon", advance: "cash", profile: "user" };
export const STATUS: Record<ReqStatus, [string, "warn" | "ok" | "bad" | "mute"]> = { pending: ["Chờ duyệt", "warn"], approved: ["Đã duyệt", "ok"], rejected: ["Từ chối", "bad"], cancelled: ["Đã hủy", "mute"] };

export const sum = (a: Array<[string, number, string?]>) => a.reduce((s, x) => s + x[1], 0);
export const netPay = (p: Payslip) => sum(p.income) - sum(p.deduct);

export const CAT: Record<NewsCat, [string, IconName]> = { policy: ["Chính sách", "book"], notice: ["Thông báo", "megaphone"], event: ["Sự kiện", "star"] };

/* Carousel trang chủ: tin trong 3 ngày gần nhất, tin quan trọng lên trước, tối đa 5 */
export const recentNews = (news: News[]) => news.filter((n) => { const [d = 0, m = 0] = n.date.split("/").map(Number); return m === 10 && 16 - d >= 0 && 16 - d <= 2; })
  .map((n, i) => ({ n, i }))
  .sort((a, b) => (b.n.important ? 1 : 0) - (a.n.important ? 1 : 0) || parseInt(b.n.date) - parseInt(a.n.date) || a.i - b.i)
  .slice(0, 5).map((x) => x.n);
export const relDay = (d: string) => { const x = 16 - parseInt(d); return x === 0 ? "Hôm nay" : x === 1 ? "Hôm qua" : d; };

export const LV_DAYS = [
  ...Array.from({ length: 13 }, (_, i) => ({ d: 19 + i, m: 10, wd: wdOct(19 + i) })),
  ...Array.from({ length: 6 }, (_, i) => ({ d: 1 + i, m: 11, wd: wdNov(1 + i) })),
];
export const lvKey = (x: { d: number; m: number }) => x.m * 100 + x.d;
