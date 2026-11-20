/* "react-native" cho mã app khi chạy web: react-native-web + vài chỗ khác biệt.
   - Platform.OS = "ios": app chạy theo nhánh iOS (nạp font, Face ID, blur, nút Hủy trong hộp thoại) — giao diện gốc là iPhone.
   - Alert: react-native-web không có hộp thoại → hộp thoại kiểu iOS dựng bằng DOM (./alert).
   - Kích thước cửa sổ: trên máy tính, app hiển thị trong khung rộng tối đa PHONE_MAX_W như điện thoại.
   - Linking.openSettings: trình duyệt không mở được Cài đặt → hướng dẫn bằng hộp thoại. */
import * as RNW from "react-native-web";
import { webAlert } from "./alert";

export * from "react-native-web";

export const PHONE_MAX_W = 440;

const RP = RNW.Platform as unknown as Record<string, unknown>;
export const Platform = {
  ...RP,
  OS: "ios" as const,
  isPad: false,
  isTV: false,
  Version: "web",
  select: <T,>(o: { ios?: T; native?: T; default?: T; web?: T }) => ("ios" in o ? o.ios : "native" in o ? o.native : o.default),
};

export const Alert = { alert: webAlert, prompt: webAlert };

const clamp = <D extends { width: number }>(d: D): D => ({ ...d, width: Math.min(d.width, PHONE_MAX_W) });
export function useWindowDimensions() {
  return clamp(RNW.useWindowDimensions());
}
export const Dimensions = {
  ...RNW.Dimensions,
  get: (dim: "window" | "screen") => clamp(RNW.Dimensions.get(dim)),
  addEventListener: RNW.Dimensions.addEventListener.bind(RNW.Dimensions),
  set: RNW.Dimensions.set?.bind(RNW.Dimensions),
};

export const Linking = {
  ...RNW.Linking,
  /* Đường dẫn PWA thay cho deep link kavor://: /clock, /leaveNew… (lối tắt trong manifest) → app nhận như kavor://clock */
  getInitialURL: async () => {
    const p = window.location.pathname.replace(/^\/+/, "");
    if (!p) return null;
    window.history.replaceState(null, "", "/");
    return `kavor://${p}`;
  },
  addEventListener: RNW.Linking.addEventListener.bind(RNW.Linking),
  canOpenURL: RNW.Linking.canOpenURL.bind(RNW.Linking),
  openURL: async (url: string) => {
    /* Liên kết tệp (PDF ký 5 phút: https://... hoặc /api/v1/...) mở tab mới; app lấy liên kết xong mới mở (đã qua lượt bấm)
       nên trình duyệt có thể chặn cửa sổ mới → hỏi lại bằng nút để có lượt bấm thật. tel:/mailto: để trình duyệt xử lý. */
    if (!/^(https?:|\/)/i.test(url)) { window.location.href = url; return; }
    /* "noopener" làm window.open luôn trả null nên tự cắt opener */
    const w = window.open(url, "_blank");
    if (w) { w.opener = null; return; }
    webAlert("Tệp đã sẵn sàng", "Liên kết chỉ dùng được trong 5 phút.", [{ text: "Hủy", style: "cancel" }, { text: "Mở", onPress: () => { window.open(url, "_blank", "noopener"); } }]);
  },
  openSettings: async () => {
    webAlert("Mở Cài đặt", "Trình duyệt không mở được Cài đặt hộ app. Bật quyền trong Cài đặt của trình duyệt (Safari: Cài đặt → Safari → Vị trí / Camera), hoặc bấm biểu tượng ổ khóa cạnh thanh địa chỉ.", [{ text: "Đã hiểu" }]);
  },
};

/* Bàn phím ảo trên web không phát sự kiện như native; giữ API để app không lỗi */
export const Keyboard = {
  ...RNW.Keyboard,
  addListener: (_e: string, _cb: unknown) => ({ remove() {} }),
  dismiss: () => { (document.activeElement as HTMLElement | null)?.blur?.(); },
};

export const Vibration = {
  vibrate: (p?: number | number[]) => { try { navigator.vibrate?.(p ?? 30); } catch { /* iOS Safari không có */ } },
  cancel: () => { try { navigator.vibrate?.(0); } catch { /* bỏ qua */ } },
};

export const LogBox = { ignoreAllLogs() {}, ignoreLogs() {} };
