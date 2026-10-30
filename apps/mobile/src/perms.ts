/* Quyền Thông báo và Vị trí của app (bản dùng API). Hệ điều hành mới cấp/thu hồi được quyền: app chỉ hỏi (lần đầu, theo hộp thoại
   mặc định của iOS/Android) hoặc mở Cài đặt của máy để người dùng tự bật/tắt. Trạng thái đọc lại mỗi khi app quay lại trước màn hình. */
import { Linking } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

export type PermState = "granted" | "denied" | "undetermined";
export type Perms = { notif: PermState; loc: PermState };

const ASKED_KEY = "kavor.permsAsked";
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const state = (p: { granted: boolean; canAskAgain: boolean; status: string }): PermState => (p.granted ? "granted" : p.status === "undetermined" && p.canAskAgain ? "undetermined" : "denied");

export async function readPerms(): Promise<Perms> {
  const [n, l] = await Promise.all([
    Notifications.getPermissionsAsync().catch(() => null),
    Location.getForegroundPermissionsAsync().catch(() => null),
  ]);
  return { notif: n ? state(n) : "denied", loc: l ? state(l) : "denied" };
}

export async function askNotif(): Promise<PermState> { return state(await Notifications.requestPermissionsAsync()); }
export async function askLoc(): Promise<PermState> { return state(await Location.requestForegroundPermissionsAsync()); }
export function openSystemSettings() { void Linking.openSettings(); }

/* Lần đầu vào app trên máy này: hỏi lần lượt Thông báo rồi Vị trí bằng hộp thoại mặc định của hệ điều hành (chỉ một lần) */
export async function askFirstRun(): Promise<Perms | null> {
  if (await SecureStore.getItemAsync(ASKED_KEY, opts).catch(() => null)) return null;
  await SecureStore.setItemAsync(ASKED_KEY, "1", opts).catch(() => {});
  const p = await readPerms();
  if (p.notif === "undetermined") await askNotif().catch(() => null);
  if (p.loc === "undetermined") await askLoc().catch(() => null);
  return readPerms();
}
