/* "react-native" cho mã app khi chạy web: react-native-web + vài chỗ khác biệt.
   - Platform.OS = "ios" chỉ có tác dụng với thư viện đọc lúc chạy: Metro thay sẵn `Platform.OS` trong mã app thành "web" lúc build.
     Mã app cần biết iPhone thì dùng IS_IOS (apps/mobile/src/os.ts, đọc userAgent).
   - Alert: react-native-web không có hộp thoại → hộp thoại kiểu iOS dựng bằng DOM (./alert).
   - Kích thước cửa sổ: trên máy tính, app hiển thị trong khung rộng tối đa PHONE_MAX_W như điện thoại.
   - Linking.openSettings: trình duyệt không mở được Cài đặt → hướng dẫn bằng hộp thoại.
   - ScrollView: bỏ khóa `overflow` trong style để danh sách cuộn ngang không bị khóa trên web, và giả lập `snapToInterval`/`snapToOffsets` + `onMomentumScrollEnd` khi ngừng cuộn (react-native-web không hỗ trợ hai tính năng này). */
import { createElement, forwardRef, useCallback, useEffect, useRef, type ComponentProps } from "react";
import * as RNW from "react-native-web";
import { webAlert } from "./alert";
import { snapTarget } from "./scroll-snap";

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

type ScrollViewProps = ComponentProps<typeof RNW.ScrollView> & {
  snapToInterval?: number;
  snapToOffsets?: number[];
  onMomentumScrollEnd?: (e: { nativeEvent: { contentOffset: { x: number; y: number } } }) => void;
};

/* react-native-web dùng overflowX/Y: auto trên div; style overflow: "visible" từ app đè mất cuộn,
   còn snapToInterval/snapToOffsets và onMomentumScrollEnd không được hỗ trợ trên web. */
export const ScrollView = forwardRef<RNW.ScrollView, ScrollViewProps>(function ScrollView(p, ref) {
  const innerRef = useRef<RNW.ScrollView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Hẹn giờ đọc props mới nhất: bấm chọn số trong lúc chờ khớp thì không bị hàm của lần render cũ ghi đè */
  const propsRef = useRef(p);
  propsRef.current = p;

  const setRef = useCallback(
    (node: RNW.ScrollView | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: RNW.ScrollView | null }).current = node;
    },
    [ref],
  );

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  let style = p.style;
  if (p.style) {
    const flat = RNW.StyleSheet.flatten(p.style) as Record<string, unknown> | undefined;
    if (flat && "overflow" in flat) {
      const { overflow: _overflow, ...rest } = flat;
      style = rest as typeof p.style;
    }
  }

  const hasSnap =
    (typeof p.snapToInterval === "number" && p.snapToInterval > 0) ||
    (Array.isArray(p.snapToOffsets) && p.snapToOffsets.length > 0);

  const onScroll: ScrollViewProps["onScroll"] = hasSnap
    ? (e) => {
        p.onScroll?.(e);
        const { contentOffset: { x, y }, contentSize, layoutMeasurement } = e.nativeEvent;
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const q = propsRef.current;
          const pos = q.horizontal ? x : y;
          const raw = snapTarget(pos, q.snapToInterval, q.snapToOffsets);
          if (raw === null) return;
          /* Điểm khớp vượt mép cuộn thì trình duyệt đứng yên, không phát thêm sự kiện → kẹp về mép */
          const max = q.horizontal ? contentSize.width - layoutMeasurement.width : contentSize.height - layoutMeasurement.height;
          const t = Math.min(raw, Math.max(0, max));
          if (Math.abs(t - pos) > 1) {
            innerRef.current?.scrollTo(q.horizontal ? { x: t, animated: true } : { y: t, animated: true });
            return;
          }
          q.onMomentumScrollEnd?.({ nativeEvent: { contentOffset: { x, y } } });
        }, 120);
      }
    : p.onScroll;

  return createElement(RNW.ScrollView, {
    ...p,
    ref: setRef,
    style,
    onScroll,
    scrollEventThrottle: hasSnap ? (p.scrollEventThrottle ?? 16) : p.scrollEventThrottle,
  });
});
