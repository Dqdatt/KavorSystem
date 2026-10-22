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

/* Chỉ xin quyền khi người dùng chủ động chấm công (theo ngữ cảnh), không xin lúc mở app */
export async function currentFix(ask = true): Promise<Fix> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new LocationError("locPerm", "Kavor cần quyền vị trí để chấm công.");
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationError("gpsOff", "Dịch vụ định vị đang tắt.");
  try {
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    return { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: Math.round((p.coords.accuracy ?? 999) * 10) / 10, at: p.timestamp };
  } catch {
    throw new LocationError("gpsOff", "Không lấy được vị trí.");
  }
}

/* Đã có quyền thì đọc vị trí để hiển thị khoảng cách; chưa có quyền thì không hỏi */
export async function quietFix(): Promise<Fix | null> {
  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!perm?.granted) return null;
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
