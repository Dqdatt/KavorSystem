/* Lớp mờ dùng chung cho iOS và Android.
   iOS: BlurView làm mờ mọi thứ phía sau.
   Android: chỉ làm mờ thật khi biết vùng nguồn (BlurTargetView bọc nội dung màn hình);
   các lớp phủ nằm ngoài vùng đó (sheet, menu tạo nhanh, dock, toast) dùng `overlay`.
   Lớp mờ nằm bên trong chính vùng nguồn không thể tự làm mờ nó, nên trên Android
   chúng hiển thị nền bán trong suốt như prototype khi trình duyệt không có backdrop-filter. */
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";

const TargetCtx = createContext<RefObject<View | null> | null>(null);

export function BlurSource({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  if (Platform.OS !== "android") return <TargetCtx.Provider value={ref}>{children}</TargetCtx.Provider>;
  return (
    <TargetCtx.Provider value={ref}>
      <BlurTargetView ref={ref} style={StyleSheet.absoluteFill}>{children}</BlurTargetView>
    </TargetCtx.Provider>
  );
}

export function Blur({ intensity = 50, tint = "light", overlay = false, style }: { intensity?: number; tint?: "light" | "dark" | "default"; overlay?: boolean; style?: StyleProp<ViewStyle> }) {
  const target = useContext(TargetCtx);
  if (Platform.OS === "android") {
    if (!overlay || !target) return null;
    return <BlurView pointerEvents="none" intensity={intensity} tint={tint} blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" blurReductionFactor={1.6} style={style ?? StyleSheet.absoluteFill} />;
  }
  return <BlurView pointerEvents="none" intensity={intensity} tint={tint} style={style ?? StyleSheet.absoluteFill} />;
}
