/* Xác thực sinh trắc học thật (Face ID / Touch ID / vân tay) và lưu phiên trong Keychain/Keystore.
   Backend chưa có nên token là token giả lập; khi có API chỉ cần thay `issueToken`. */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

export type Session = { token: string; employeeId: string; deviceRegistered: boolean; createdAt: number };
export type BiometricResult = { ok: true } | { ok: false; reason: "unavailable" | "not_enrolled" | "cancelled" | "failed"; message: string };

const SESSION_KEY = "kavor.session";
/* Thông tin đăng nhập nhanh: giữ lại sau khi đăng xuất để lần sau dùng Face ID thay mật khẩu */
const QUICK_LOGIN_KEY = "kavor.quickLogin";
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
  const next: Session = { token: prev?.token ?? issueToken(), deviceRegistered: prev?.deviceRegistered ?? false, createdAt: prev?.createdAt ?? Date.now(), ...patch };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next), opts);
  await SecureStore.setItemAsync(QUICK_LOGIN_KEY, next.employeeId, opts);
  return next;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY, opts).catch(() => {});
}

export async function quickLoginEmployee(): Promise<string | null> {
  return SecureStore.getItemAsync(QUICK_LOGIN_KEY, opts).catch(() => null);
}

/* Tên gọi theo phần cứng: "Face ID" trên iPhone có Face ID, "Touch ID"/"vân tay" khi chỉ có cảm biến vân tay */
export async function biometricLabel(): Promise<string> {
  const types: LocalAuthentication.AuthenticationType[] = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []);
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Face ID";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "vân tay";
  return "sinh trắc học";
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

/* Tùy chọn sinh trắc học của người dùng (mặc định bật cả hai) */
export type BioPrefs = { login: boolean; unlock: boolean };
const PREFS_KEY = "kavor.bioPrefs";
export async function loadBioPrefs(): Promise<BioPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY, opts);
    return { login: true, unlock: true, ...(raw ? (JSON.parse(raw) as Partial<BioPrefs>) : {}) };
  } catch {
    return { login: true, unlock: true };
  }
}
export async function saveBioPrefs(p: BioPrefs) {
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(p), opts);
}
