/* expo-secure-store trên web: lưu trong localStorage của origin PWA (không có Keychain — xem README "Rủi ro").
   Giữ cùng API async để mã app không phải đổi. */
export type SecureStoreOptions = { keychainAccessible?: number; keychainService?: string; requireAuthentication?: boolean };
export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

const P = "kavor-pwa:";
const ok = (key: string) => { if (!/^[\w.-]+$/.test(key)) throw new Error(`Khóa không hợp lệ: ${key}`); return P + key; };

export async function isAvailableAsync() { return typeof localStorage !== "undefined"; }
export async function getItemAsync(key: string, _o?: SecureStoreOptions): Promise<string | null> { return localStorage.getItem(ok(key)); }
export async function setItemAsync(key: string, value: string, _o?: SecureStoreOptions): Promise<void> {
  if (typeof value !== "string") throw new Error("SecureStore chỉ lưu chuỗi");
  localStorage.setItem(ok(key), value);
}
export async function deleteItemAsync(key: string, _o?: SecureStoreOptions): Promise<void> { localStorage.removeItem(ok(key)); }
export function getItem(key: string) { return localStorage.getItem(ok(key)); }
export function setItem(key: string, value: string) { localStorage.setItem(ok(key), value); }
export function canUseBiometricAuthentication() { return false; }
