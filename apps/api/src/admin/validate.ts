/* Kiểm tra dữ liệu đầu vào của API HR/Admin: sai thì trả 400 kèm tên trường */
import { invalid } from "./context.js";

export type Body = Record<string, unknown>;

const bad = (field: string, hint = "") => invalid(`Trường "${field}" không hợp lệ${hint ? `: ${hint}` : ""}.`);

export function text(b: Body, k: string, opts: { min?: number; max?: number; optional?: boolean; pattern?: RegExp; hint?: string } = {}): string | undefined {
  const v = b?.[k];
  if ((v === undefined || v === null || v === "") && opts.optional) return undefined;
  if (typeof v !== "string") throw bad(k, opts.hint);
  const t = v.trim();
  if (t.length < (opts.min ?? 1) || t.length > (opts.max ?? 200) || (opts.pattern && !opts.pattern.test(t))) throw bad(k, opts.hint);
  return t;
}
export const req = (b: Body, k: string, opts: Parameters<typeof text>[2] = {}) => text(b, k, { ...opts, optional: false })!;

export function nullableText(b: Body, k: string, max = 200): string | null | undefined {
  if (!(k in (b ?? {}))) return undefined;
  const v = b[k];
  if (v === null || v === "") return null;
  if (typeof v !== "string" || v.length > max) throw bad(k);
  return v.trim() || null;
}

export function number(b: Body, k: string, lo: number, hi: number, opts: { optional?: boolean; integer?: boolean } = {}): number | undefined {
  const v = b?.[k];
  if ((v === undefined || v === null) && opts.optional) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi || (opts.integer && !Number.isInteger(v))) throw bad(k, `từ ${lo} đến ${hi}`);
  return v;
}

export function oneOf<T extends string>(b: Body, k: string, options: readonly T[], optional = false): T | undefined {
  const v = b?.[k];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || !options.includes(v as T)) throw bad(k);
  return v as T;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isDate(v: string) { return DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v); }
export function date(b: Body, k: string, optional = false): string | undefined {
  const v = b?.[k];
  if ((v === undefined || v === null || v === "") && optional) return undefined;
  if (typeof v !== "string" || !isDate(v)) throw bad(k, "định dạng YYYY-MM-DD");
  return v;
}
export function time(b: Body, k: string, optional = false): string | null | undefined {
  const v = b?.[k];
  if ((v === undefined || v === null || v === "") && optional) return null;
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(k, "định dạng HH:MM");
  return v;
}
export function uuid(b: Body, k: string, optional = false): string | undefined {
  const v = b?.[k];
  if ((v === undefined || v === null || v === "") && optional) return undefined;
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw bad(k);
  return v;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Thêm/bớt ngày cho chuỗi YYYY-MM-DD */
export function addDays(d: string, n: number) { return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10); }
