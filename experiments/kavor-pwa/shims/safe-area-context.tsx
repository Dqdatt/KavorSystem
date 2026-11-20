/* react-native-safe-area-context cho PWA:
   - Trên điện thoại thật (PWA đã cài ra Màn hình chính, viewport-fit=cover): đọc env(safe-area-inset-*).
   - Trên trình duyệt thường / máy tính (env = 0): dùng khoảng đệm 48px phía trên như khung iPhone 11 của prototype,
     để thanh tiêu đề và các màn đăng nhập/khóa giữ đúng tỷ lệ với app native. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

export type EdgeInsets = { top: number; right: number; bottom: number; left: number };
export type Rect = { x: number; y: number; width: number; height: number };

const DEFAULT_INSETS: EdgeInsets = { top: 48, right: 0, bottom: 0, left: 0 };
const InsetsCtx = createContext<EdgeInsets>(DEFAULT_INSETS);
const FrameCtx = createContext<Rect>({ x: 0, y: 0, width: 390, height: 844 });

function readEnvInsets(): EdgeInsets {
  if (typeof document === "undefined") return DEFAULT_INSETS;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const n = (v: string) => parseInt(v, 10) || 0;
  const top = n(cs.paddingTop), right = n(cs.paddingRight), bottom = n(cs.paddingBottom), left = n(cs.paddingLeft);
  el.remove();
  /* Không có safe-area của máy (trình duyệt thường / desktop) → giữ 48px phía trên như khung iPhone 11 */
  return { top: top || 48, right, bottom, left };
}

export function SafeAreaProvider({ children, style }: ViewProps & { children?: ReactNode }) {
  const [insets, setInsets] = useState<EdgeInsets>(DEFAULT_INSETS);
  const [frame, setFrame] = useState<Rect>(() => ({ x: 0, y: 0, width: typeof window === "undefined" ? 390 : window.innerWidth, height: typeof window === "undefined" ? 844 : window.innerHeight }));
  useEffect(() => {
    const update = () => {
      setInsets(readEnvInsets());
      setFrame({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <FrameCtx.Provider value={frame}>
      <InsetsCtx.Provider value={insets}>
        <View style={[{ flex: 1, overflow: "visible" }, style]}>{children}</View>
      </InsetsCtx.Provider>
    </FrameCtx.Provider>
  );
}

export const useSafeAreaInsets = () => useContext(InsetsCtx);
export const useSafeAreaFrame = () => useContext(FrameCtx);
export const SafeAreaInsetsContext = InsetsCtx;
export const SafeAreaFrameContext = FrameCtx;
export function SafeAreaView({ children, style, ...rest }: ViewProps) {
  const i = useSafeAreaInsets();
  return <View {...rest} style={[{ paddingTop: i.top, paddingRight: i.right, paddingBottom: i.bottom, paddingLeft: i.left }, style]}>{children}</View>;
}
export const initialWindowMetrics = { insets: DEFAULT_INSETS, frame: { x: 0, y: 0, width: 390, height: 844 } };
