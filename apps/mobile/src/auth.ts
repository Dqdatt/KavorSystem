/* Xác thực sinh trắc học thật (Face ID / Touch ID / vân tay) và lưu phiên trong Keychain/Keystore.
   Có API (REMOTE): phiên chứa access/refresh token thật. Chế độ dữ liệu mẫu: token giả lập. */
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import type { AuthSession, MeProfile, SupportContact } from "@kavor/contracts";

export type Session = { token: string; employeeId: string; deviceRegistered: boolean; createdAt: number; auth?: AuthSession; me?: MeProfile };
export type BiometricResult = { ok: true } | { ok: false; reason: "unavailable" | "not_enrolled" | "cancelled" | "failed"; message: string };

const SESSION_KEY = "kavor.session";
/* Thông tin đăng nhập nhanh: giữ lại sau khi đăng xuất để lần sau dùng Face ID thay mật khẩu.
   Có API thì lưu refresh token; chỉ đọc sau khi Face ID thành công. */
const QUICK_LOGIN_KEY = "kavor.quickLogin";
const QUICK_REFRESH_KEY = "kavor.quickRefresh";
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const issueToken = () => `dev.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY, opts);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(patch: Partial<Session> & { employeeId: string }) {
  const prev = await loadSession();
  /* Giữ mọi trường của phiên cũ (token API, hồ sơ, thiết bị) trừ khi đổi người dùng */
  const same = prev?.employeeId === patch.employeeId;
  const next: Session = { ...(same ? prev : {}), token: (same && prev?.token) || issueToken(), deviceRegistered: (same && prev?.deviceRegistered) || false, createdAt: (same && prev?.createdAt) || Date.now(), ...patch } as Session;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next), opts);
  await SecureStore.setItemAsync(QUICK_LOGIN_KEY, next.employeeId, opts);
  if (next.auth) await SecureStore.setItemAsync(QUICK_REFRESH_KEY, next.auth.refreshToken, opts);
  return next;
}

/* Liên hệ HR gần nhất của công ty: giữ cả sau khi đăng xuất, vì khi tài khoản bị khóa app không gọi được /me/company
   mà màn E16 vẫn cần chỉ cho nhân viên cách liên hệ */
const SUPPORT_KEY = "kavor.support";
export async function saveSupport(s: SupportContact | null) {
  await (s ? SecureStore.setItemAsync(SUPPORT_KEY, JSON.stringify(s), opts) : SecureStore.deleteItemAsync(SUPPORT_KEY, opts)).catch(() => {});
}
export async function loadSupport(): Promise<SupportContact | null> {
  try { const raw = await SecureStore.getItemAsync(SUPPORT_KEY, opts); return raw ? (JSON.parse(raw) as SupportContact) : null; } catch { return null; }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY, opts).catch(() => {});
}

export async function quickRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(QUICK_REFRESH_KEY, opts).catch(() => null);
}
/* Quên đăng nhập nhanh (tắt Face ID đăng nhập, hoặc refresh token đã bị thu hồi) */
export async function clearQuickLogin() {
  await SecureStore.deleteItemAsync(QUICK_REFRESH_KEY, opts).catch(() => {});
}

export async function quickLoginEmployee(): Promise<string | null> {
  return SecureStore.getItemAsync(QUICK_LOGIN_KEY, opts).catch(() => null);
}

export type BioKind = "face" | "finger" | "none";
/* Loại sinh trắc học theo phần cứng + tên gọi theo hệ điều hành: iPhone → Face ID / Touch ID; Android ưu tiên vân tay
   (nhận diện khuôn mặt trên đa số máy Android là loại yếu, không dùng để mở khóa ứng dụng) */
export async function biometricKind(): Promise<{ kind: BioKind; label: string }> {
  const types: LocalAuthentication.AuthenticationType[] = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  if (Platform.OS === "ios") return face ? { kind: "face", label: "Face ID" } : finger ? { kind: "finger", label: "Touch ID" } : { kind: "none", label: "sinh trắc học" };
  return finger ? { kind: "finger", label: "vân tay" } : face ? { kind: "face", label: "khuôn mặt" } : { kind: "none", label: "sinh trắc học" };
}
export async function biometricLabel(): Promise<string> {
  return (await biometricKind()).label;
}

export async function authenticate(promptMessage: string): Promise<BiometricResult> {
  const label = await biometricLabel();
  if (!(await LocalAuthentication.hasHardwareAsync())) return { ok: false, reason: "unavailable", message: "Thiết bị không hỗ trợ xác thực sinh trắc học." };
  if (!(await LocalAuthentication.isEnrolledAsync())) return { ok: false, reason: "not_enrolled", message: `Bạn chưa thiết lập ${label} trong Cài đặt của máy.` };
  const res = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Hủy", fallbackLabel: "Nhập PIN", disableDeviceFallback: true });
  if (res.success) return { ok: true };
  const cancelled = res.error === "user_cancel" || res.error === "system_cancel" || res.error === "app_cancel" || res.error === "user_fallback";
  return { ok: false, reason: cancelled ? "cancelled" : "failed", message: cancelled ? "Đã hủy xác thực." : `${label} không khớp. Thử lại hoặc nhập PIN.` };
}

/* Tùy chọn sinh trắc học của người dùng. defaultOn: bản mẫu prototype bật sẵn; bản dùng API mặc định tắt, chỉ bật khi người dùng đồng ý.
   asked: đã hỏi "Dùng Face ID cho Kavor?" trên máy này (chỉ hỏi một lần). Lưu theo máy, giữ qua đăng xuất. */
export type BioPrefs = { login: boolean; unlock: boolean; asked?: boolean };
const PREFS_KEY = "kavor.bioPrefs";
export async function loadBioPrefs(defaultOn = true): Promise<BioPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY, opts);
    return { login: defaultOn, unlock: defaultOn, ...(raw ? (JSON.parse(raw) as Partial<BioPrefs>) : {}) };
  } catch {
    return { login: defaultOn, unlock: defaultOn };
  }
}
/* Máy có phần cứng sinh trắc học và người dùng đã cài Face ID/vân tay trong hệ điều hành */
export async function biometricReady(): Promise<boolean> {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
export async function saveBioPrefs(p: BioPrefs) {
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(p), opts);
}
