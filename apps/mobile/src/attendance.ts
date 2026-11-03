/* Chấm công thật: định danh cài đặt, lấy vị trí GPS và hàng đợi offline.
   Hàng đợi lưu trong Keychain/Keystore (mã hóa), gửi lại với cùng clientEventId nên máy chủ không ghi trùng. */
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import type { AttendanceEventRequest, DeviceRegisterRequest } from "@kavor/contracts";

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const INSTALL_KEY = "kavor.installationId";
const QUEUE_KEY = "kavor.punchQueue";

let installCache: string | null = null;
/* Mã cài đặt: sinh một lần, mất khi gỡ app (dùng để HR biết đang chấm công trên máy nào) */
export async function installationId(): Promise<string> {
  if (installCache) return installCache;
  let id = await SecureStore.getItemAsync(INSTALL_KEY, opts).catch(() => null);
  if (!id) { id = Crypto.randomUUID(); await SecureStore.setItemAsync(INSTALL_KEY, id, opts); }
  installCache = id;
  return id;
}

export const newEventId = () => Crypto.randomUUID();

export function deviceSummary() {
  return {
    model: Device.modelName ?? (Platform.OS === "ios" ? "iPhone" : "Android"),
    os: `${Platform.OS === "ios" ? "iOS" : "Android"} ${Device.osVersion ?? ""}`.trim(),
    name: Device.deviceName ?? null,
  };
}

export async function deviceRegistration(appVersion: string): Promise<DeviceRegisterRequest> {
  return { installationId: await installationId(), platform: Platform.OS === "ios" ? "ios" : "android", deviceModel: Device.modelName ?? undefined, osVersion: Device.osVersion ?? undefined, appVersion };
}

export type Fix = { latitude: number; longitude: number; accuracyM: number; at: number };
export class LocationError extends Error {
  /* locPerm: chưa cấp quyền (E20) · gpsOff: tắt định vị hoặc không lấy được vị trí (E21) */
  constructor(readonly kind: "locPerm" | "gpsOff", message: string) { super(message); }
}

const toFix = (p: Location.LocationObject): Fix => ({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: Math.round((p.coords.accuracy ?? 999) * 10) / 10, at: p.timestamp });
const FRESH_MS = 60_000;

/* Theo dõi GPS liên tục khi app đang mở (trang chủ): lúc bấm chấm công thường đã có vị trí mới, gửi được ngay */
let last: Fix | null = null;
let sub: Location.LocationSubscription | null = null;
let starting = false;
const listeners = new Set<(f: Fix) => void>();
const push = (f: Fix) => { if (!last || f.at >= last.at) last = f; listeners.forEach((l) => l(f)); };
export function onFix(fn: (f: Fix) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function watchFix(on: boolean) {
  if (!on) { sub?.remove(); sub = null; return; }
  if (sub || starting) return;
  starting = true;
  try {
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!perm?.granted) return;
    sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 }, (p) => push(toFix(p))).catch(() => null);
  } finally { starting = false; }
}
const freshFix = (needM: number) => (last && Date.now() - last.at < FRESH_MS && last.accuracyM <= needM ? last : null);

/* Chỉ xin quyền khi người dùng chủ động chấm công (theo ngữ cảnh), không xin lúc mở app.
   Có vị trí mới (≤ 60 giây) đủ chính xác thì trả ngay; chưa có thì lấy đến khi đạt ngưỡng `needM` của địa điểm
   (không chờ mức chính xác cao nhất), quá 10 giây trả vị trí tốt nhất đang có để máy chủ xét. */
export async function currentFix(ask = true, needM = 50, onProgress?: (f: Fix) => void): Promise<Fix> {
  const hit = freshFix(needM);
  if (hit) return hit;
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new LocationError("locPerm", "Kavor cần quyền vị trí để chấm công.");
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationError("gpsOff", "Dịch vụ định vị đang tắt.");
  void watchFix(true);
  return new Promise<Fix>((resolve, reject) => {
    let best: Fix | null = null, done = false;
    const take = (f: Fix) => {
      if (done) return;
      if (!best || f.accuracyM <= best.accuracyM) best = f;
      onProgress?.(f);
      if (f.accuracyM <= needM) finish();
    };
    const finish = () => {
      if (done) return;
      done = true; off(); clearTimeout(timer);
      if (best) resolve(best); else reject(new LocationError("gpsOff", "Không lấy được vị trí."));
    };
    const off = onFix(take);
    const timer = setTimeout(finish, 10_000);
    /* Vị trí hệ điều hành vừa có (app khác/lần trước) — trả về tức thì nếu đủ mới và chính xác */
    Location.getLastKnownPositionAsync({ maxAge: FRESH_MS, requiredAccuracy: needM }).then((p) => { if (p) take(toFix(p)); }).catch(() => {});
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((p) => take(toFix(p))).catch(() => {});
  });
}

/* Đã có quyền thì đọc vị trí để hiển thị khoảng cách; chưa có quyền thì không hỏi */
export async function quietFix(): Promise<Fix | null> {
  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!perm?.granted) return null;
  if (last && Date.now() - last.at < FRESH_MS) return last;
  return currentFix(false).catch(() => null);
}

export type QueuedPunch = AttendanceEventRequest & { queuedAt: number };

export async function readQueue(): Promise<QueuedPunch[]> {
  const raw = await SecureStore.getItemAsync(QUEUE_KEY, opts).catch(() => null);
  try { return raw ? (JSON.parse(raw) as QueuedPunch[]) : []; } catch { return []; }
}
async function writeQueue(q: QueuedPunch[]) {
  if (q.length) await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(q), opts);
  else await SecureStore.deleteItemAsync(QUEUE_KEY, opts).catch(() => {});
}
export async function enqueue(p: AttendanceEventRequest) {
  const q = await readQueue();
  if (!q.some((x) => x.clientEventId === p.clientEventId)) q.push({ ...p, offline: true, occurredAt: p.occurredAt ?? new Date().toISOString(), queuedAt: Date.now() });
  await writeQueue(q);
}
/* Gửi lần lượt; lỗi mạng thì dừng và giữ lại, máy chủ trả lỗi nghiệp vụ thì bỏ khỏi hàng đợi và báo lại */
export async function flushQueue(send: (p: AttendanceEventRequest) => Promise<unknown>, isNetworkError: (e: unknown) => boolean) {
  const q = await readQueue();
  const sent: QueuedPunch[] = [], failed: Array<{ p: QueuedPunch; error: unknown }> = [];
  for (const p of q) {
    try { await send(p); sent.push(p); } catch (e) {
      if (isNetworkError(e)) break;
      failed.push({ p, error: e });
    }
  }
  const done = new Set([...sent, ...failed.map((f) => f.p)].map((p) => p.clientEventId));
  await writeQueue(q.filter((p) => !done.has(p.clientEventId)));
  return { sent, failed, remaining: q.length - done.size };
}
