/* expo-notifications trên web (chỉ phần app dùng: quyền + nhắc hạn giải trình cục bộ).
   Không có push từ máy chủ. Nhắc hẹn giờ chỉ bắn khi PWA đang mở (trình duyệt không có lịch thông báo cục bộ);
   hiển thị qua service worker để bấm vào mở đúng ngày giải trình. iPhone: cần iOS 16.4+ và PWA đã thêm vào Màn hình chính. */
type Perm = { granted: boolean; canAskAgain: boolean; status: "granted" | "denied" | "undetermined" };
type Content = { title?: string; body?: string; data?: Record<string, unknown> };
export type NotificationRequest = { identifier: string; content: Content; trigger: unknown };
export type Notification = { request: NotificationRequest; date: number };
export type NotificationResponse = { notification: Notification; actionIdentifier: string };
export enum SchedulableTriggerInputTypes { DATE = "date", TIME_INTERVAL = "timeInterval", DAILY = "daily" }

const has = () => typeof window !== "undefined" && "Notification" in window;
const perm = (): Perm => {
  if (!has()) return { granted: false, canAskAgain: false, status: "denied" };
  const p = window.Notification.permission;
  return p === "granted" ? { granted: true, canAskAgain: false, status: "granted" } : p === "denied" ? { granted: false, canAskAgain: false, status: "denied" } : { granted: false, canAskAgain: true, status: "undetermined" };
};

export async function getPermissionsAsync(): Promise<Perm> { return perm(); }
export async function requestPermissionsAsync(): Promise<Perm> {
  if (has() && window.Notification.permission === "default") await window.Notification.requestPermission().catch(() => undefined);
  return perm();
}
export function setNotificationHandler(_h: unknown) {}

const scheduled = new Map<string, { req: NotificationRequest; timer: ReturnType<typeof setTimeout> }>();
let seq = 0;
const MAX_DELAY = 2_147_000_000; // giới hạn setTimeout (~24,8 ngày)

async function show(req: NotificationRequest) {
  if (!perm().granted) return;
  const opts = { body: req.content.body, data: { ...req.content.data, __id: req.identifier }, icon: "/icon-192.png", badge: "/icon-192.png", tag: req.identifier };
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg) await reg.showNotification(req.content.title ?? "Kavor", opts);
  else new window.Notification(req.content.title ?? "Kavor", opts).onclick = () => emit(req);
}

export async function scheduleNotificationAsync(r: { content: Content; trigger: { type?: string; date?: Date | number; seconds?: number } | null }): Promise<string> {
  const id = `kv-${Date.now().toString(36)}-${++seq}`;
  const req: NotificationRequest = { identifier: id, content: r.content, trigger: r.trigger };
  const at = r.trigger?.date != null ? new Date(r.trigger.date).getTime() : r.trigger?.seconds != null ? Date.now() + r.trigger.seconds * 1000 : Date.now();
  const delay = Math.max(0, at - Date.now());
  if (delay <= MAX_DELAY) scheduled.set(id, { req, timer: setTimeout(() => { scheduled.delete(id); void show(req); }, delay) });
  return id;
}
export async function getAllScheduledNotificationsAsync(): Promise<NotificationRequest[]> { return [...scheduled.values()].map((s) => s.req); }
export async function cancelScheduledNotificationAsync(id: string) { const s = scheduled.get(id); if (s) { clearTimeout(s.timer); scheduled.delete(id); } }
export async function cancelAllScheduledNotificationsAsync() { for (const id of [...scheduled.keys()]) await cancelScheduledNotificationAsync(id); }

/* Bấm thông báo: service worker gửi { type: "kavor-notification-click", data } về trang */
const listeners = new Set<(r: NotificationResponse) => void>();
let last: NotificationResponse | null = null;
function emit(req: NotificationRequest) {
  const r: NotificationResponse = { notification: { request: req, date: Date.now() }, actionIdentifier: "default" };
  last = r;
  for (const l of listeners) l(r);
}
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const m = e.data as { type?: string; title?: string; body?: string; data?: Record<string, unknown> } | null;
    if (m?.type === "kavor-notification-click") emit({ identifier: String(m.data?.__id ?? "sw"), content: { title: m.title, body: m.body, data: m.data }, trigger: null });
  });
}
export function addNotificationResponseReceivedListener(l: (r: NotificationResponse) => void) { listeners.add(l); return { remove: () => listeners.delete(l) }; }
export function addNotificationReceivedListener(_l: unknown) { return { remove() {} }; }
export function getLastNotificationResponse() { return last; }
export async function getLastNotificationResponseAsync() { return last; }
export async function setBadgeCountAsync(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try { await (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.()); return true; } catch { return false; }
}
