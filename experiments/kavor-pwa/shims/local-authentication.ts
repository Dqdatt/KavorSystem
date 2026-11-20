/* expo-local-authentication trên web: dùng WebAuthn với khóa của chính máy (Face ID / Touch ID / vân tay của hệ điều hành).
   Giống bản native, đây chỉ là lớp chặn trên máy: máy chủ vẫn chỉ tin phiên đăng nhập. Khóa được tạo ở lần xác thực đầu tiên,
   id lưu trong localStorage. Không có WebAuthn (http thường, trình duyệt cũ) → báo không có phần cứng, app dùng mã PIN. */
export enum AuthenticationType { FINGERPRINT = 1, FACIAL_RECOGNITION = 2, IRIS = 3 }
export enum SecurityLevel { NONE = 0, SECRET = 1, BIOMETRIC_WEAK = 2, BIOMETRIC_STRONG = 3 }
export type LocalAuthenticationOptions = { promptMessage?: string; cancelLabel?: string; fallbackLabel?: string; disableDeviceFallback?: boolean };
export type LocalAuthenticationResult = { success: true } | { success: false; error: string; warning?: string };

const CRED_KEY = "kavor-pwa:webauthn";
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
const isApple = () => /iPhone|iPad|Macintosh/.test(ua());

export async function hasHardwareAsync(): Promise<boolean> {
  try {
    const P = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    return !!(window.isSecureContext && P?.isUserVerifyingPlatformAuthenticatorAvailable && (await P.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch { return false; }
}
export const isEnrolledAsync = hasHardwareAsync;
export async function getEnrolledLevelAsync() { return (await hasHardwareAsync()) ? SecurityLevel.BIOMETRIC_STRONG : SecurityLevel.NONE; }

/* Trình duyệt không cho biết loại sinh trắc học: trên Android báo vân tay, còn lại (iPhone, iPad, Mac, mô phỏng iPhone) báo Face ID */
export async function supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]> {
  if (!(await hasHardwareAsync())) return [];
  if (/Android/i.test(ua())) return [AuthenticationType.FINGERPRINT];
  return [AuthenticationType.FACIAL_RECOGNITION];
}

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function mapError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "user_cancel";
  if (name === "InvalidStateError") return "not_enrolled";
  return "authentication_failed";
}

export async function authenticateAsync(_o?: LocalAuthenticationOptions): Promise<LocalAuthenticationResult> {
  if (!(await hasHardwareAsync())) return { success: false, error: "not_available" };
  const saved = localStorage.getItem(CRED_KEY);
  try {
    if (saved) {
      const got = await navigator.credentials.get({ publicKey: {
        challenge: rnd(32), rpId: location.hostname, userVerification: "required", timeout: 60_000,
        allowCredentials: [{ type: "public-key", id: unb64(saved), transports: ["internal"] }],
      } });
      return got ? { success: true } : { success: false, error: "authentication_failed" };
    }
    const made = (await navigator.credentials.create({ publicKey: {
      challenge: rnd(32),
      rp: { name: "Kavor", id: location.hostname },
      user: { id: rnd(16), name: "kavor-pwa", displayName: "Kavor" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000, attestation: "none",
    } })) as PublicKeyCredential | null;
    if (!made) return { success: false, error: "authentication_failed" };
    localStorage.setItem(CRED_KEY, b64(made.rawId));
    return { success: true };
  } catch (e) {
    return { success: false, error: mapError(e) };
  }
}

export async function cancelAuthenticate() {}
export const _isApple = isApple;
