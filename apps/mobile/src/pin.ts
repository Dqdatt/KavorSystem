/* Mã PIN mở khóa lương, tạm ứng, tài liệu (docs/plans/mobile-ui-feedback.md mục 3). Lưu trên máy, theo từng nhân viên:
   muối ngẫu nhiên + SHA-256 trong Keychain/Keystore (chỉ đọc khi máy đã mở khóa, không sao lưu sang máy khác).
   Sai PIN_MAX_ATTEMPTS lần liên tiếp thì xóa PIN — người dùng phải đăng nhập lại rồi tạo PIN mới.
   Không gửi PIN lên máy chủ: API vẫn chỉ tin phiên đăng nhập; PIN là lớp chặn người cầm máy đang mở khóa. */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

export const PIN_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;

type Stored = { salt: string; hash: string; failures: number };
export type PinCheck = { ok: true } | { ok: false; left: number } | { ok: false; locked: true };

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/* Khóa SecureStore chỉ nhận chữ, số, ".", "-", "_" */
const key = (employeeId: string) => `kavor.pin.${employeeId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const digest = (salt: string, pin: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

async function read(employeeId: string): Promise<Stored | null> {
  try {
    const raw = await SecureStore.getItemAsync(key(employeeId), opts);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
const write = (employeeId: string, s: Stored) => SecureStore.setItemAsync(key(employeeId), JSON.stringify(s), opts);

/* Chỉ chấp nhận đúng 6 chữ số; không cho 6 số giống nhau hoặc dãy liên tiếp (dễ đoán nhất) */
export function weakPin(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Mã PIN gồm ${PIN_LENGTH} chữ số.`;
  if (/^(\d)\1+$/.test(pin)) return "Không dùng 6 số giống nhau.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "Không dùng dãy số liên tiếp.";
  return null;
}

export async function hasPin(employeeId: string): Promise<boolean> {
  return !!(await read(employeeId));
}

export async function setPin(employeeId: string, pin: string) {
  const err = weakPin(pin);
  if (err) throw new Error(err);
  const salt = hex(Crypto.getRandomBytes(16));
  await write(employeeId, { salt, hash: await digest(salt, pin), failures: 0 });
}

export async function checkPin(employeeId: string, pin: string): Promise<PinCheck> {
  const s = await read(employeeId);
  if (!s) return { ok: false, locked: true };
  if ((await digest(s.salt, pin)) === s.hash) {
    if (s.failures) await write(employeeId, { ...s, failures: 0 });
    return { ok: true };
  }
  const failures = s.failures + 1;
  if (failures >= PIN_MAX_ATTEMPTS) { await clearPin(employeeId); return { ok: false, locked: true }; }
  await write(employeeId, { ...s, failures });
  return { ok: false, left: PIN_MAX_ATTEMPTS - failures };
}

/* Mở bằng sinh trắc học thành công: xóa đếm sai của PIN */
export async function resetPinFailures(employeeId: string) {
  const s = await read(employeeId);
  if (s?.failures) await write(employeeId, { ...s, failures: 0 });
}

export async function clearPin(employeeId: string) {
  await SecureStore.deleteItemAsync(key(employeeId), opts).catch(() => {});
}
