/* Nhắc hạn giải trình bằng thông báo cục bộ trên máy — không cần APNs/FCM nên dùng được khi chưa có tài khoản Apple Developer.
   Lịch nhắc tính lại mỗi lần tải bảng công: 09:00 ngày trước hạn và 09:00 ngày hạn (giờ trên máy) cho các ngày còn giải trình được.
   Thông báo từ máy chủ (đơn được duyệt, cần duyệt…) chỉ hiện trong app; push khi app tắt để sau (xem PROGRESS). */
import * as Notifications from "expo-notifications";
import type { MyTimesheet } from "@kavor/contracts";

const TAG = "kavor.explain";
let asked = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const at9 = (date: string, addDays: number) => { const [y, m, d] = date.split("-").map(Number) as [number, number, number]; return new Date(y, m - 1, d + addDays, 9, 0, 0); };

async function allowed() {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return true;
  /* Chỉ hỏi quyền một lần mỗi lần mở app, và chỉ khi thật sự có lịch cần nhắc */
  if (!p.canAskAgain || asked) return false;
  asked = true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function clearExplainReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter((n) => n.content.data?.tag === TAG).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/* issueOf: mô tả ngắn bất thường của ngày ("thiếu giờ ra") */
export async function scheduleExplainReminders(t: MyTimesheet, issueOf: (date: string) => string) {
  try {
    await clearExplainReminders();
    const q = t.explanation;
    if (!q || q.left <= 0 || t.period.locked) return;
    const byDeadline = new Map<string, string[]>();
    for (const d of t.days) if (d.canExplain && d.explainDeadline) byDeadline.set(d.explainDeadline, [...(byDeadline.get(d.explainDeadline) ?? []), d.date]);
    const now = Date.now();
    const plan = [...byDeadline].flatMap(([deadline, dates]) => [-1, 0].map((k) => ({ when: at9(deadline, k), deadline, dates, last: k === 0 }))).filter((p) => p.when.getTime() > now + 60_000);
    if (!plan.length || !(await allowed())) return;
    for (const p of plan) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: p.last ? `Hôm nay là hạn giải trình công` : `Hạn giải trình công: ${ddmm(p.deadline)}`,
          body: `${p.dates.map((d) => `Ngày ${ddmm(d)} ${issueOf(d)}`).join(", ")} · còn ${q.left}/${q.limit} lượt`,
          data: { tag: TAG, date: p.dates[0] },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.when },
      });
    }
  } catch {
    /* Không hẹn được nhắc nhở (máy từ chối, lỗi hệ thống) thì bỏ qua — bảng công vẫn hiện hạn */
  }
}

/* Bấm vào nhắc nhở (kể cả khi app đang tắt) → mở giải trình của ngày đó */
export function onReminderTap(open: (date: string) => void) {
  const handle = (r: Notifications.NotificationResponse | null) => {
    const d = r?.notification.request.content.data;
    if (d?.tag === TAG && typeof d.date === "string") open(d.date);
  };
  Notifications.addNotificationResponseReceivedListener(handle);
  return () => handle(Notifications.getLastNotificationResponse());
}
