import { createContext, useContext, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { Blur } from "./blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, EASE, F } from "./theme";
import { Ic } from "./icons";
import { Rise, useReducedMotion } from "./motion";
import { Avatar, T, TbBtn } from "./ui";
import { ACT, back, go, scrollRequests, scrollTopRequests, unreadCount } from "./store";

/* ---------- Dock tuck (navbar ẩn/hiện khi cuộn) ---------- */
export const dockTuck = new Animated.Value(0);
let tucked = false;
export function setTuck(v: boolean) {
  if (v === tucked) return; tucked = v;
  Animated.timing(dockTuck, { toValue: v ? 1 : 0, duration: 450, easing: EASE, useNativeDriver: true }).start();
}

/* ---------- Deco: ba đốm sáng mint trôi chậm phía sau màn hình ---------- */
function Blob({ style, color, duration }: { style: ViewStyle; color: string; duration: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [reduced, v, duration]);
  return <Animated.View style={[{ position: "absolute", borderRadius: 999, experimental_backgroundImage: `radial-gradient(circle closest-side, ${color} 0%, ${color.replace(/[\d.]+\)$/, "0)")} 96%)` }, style, {
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
  }]} />;
}
export function Deco() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Blob duration={14000} color="rgba(167,243,208,0.95)" style={{ width: 380, height: 380, top: -130, left: -130 }} />
      <Blob duration={18000} color="rgba(16,185,129,0.38)" style={{ width: 320, height: 320, top: "36%", right: -150 }} />
      <Blob duration={16000} color="rgba(110,231,183,0.6)" style={{ width: 360, height: 360, bottom: -150, left: -70 }} />
    </View>
  );
}

/* ---------- Screen context: thanh tiêu đề chuyển sang kính khi nội dung cuộn qua ---------- */
const ScrolledCtx = createContext<Animated.Value | null>(null);

function GlassBar() {
  const scrolled = useContext(ScrolledCtx);
  if (!scrolled) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: scrolled }]}>
      <Blur intensity={30} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42))", boxShadow: "inset 0px -1px 0px rgba(255,255,255,0.85), 0px 8px 20px -14px rgba(6,70,50,0.3)" }]} />
    </Animated.View>
  );
}

function Bar({ left, title, right, kind }: { left: ReactNode; title: ReactNode; right: ReactNode; kind?: "brand" | "big" }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tb, { paddingTop: Math.max(insets.top + 4, 24) }]}>
      <GlassBar />
      <View style={styles.tbSide}>{left}</View>
      <View style={styles.tbTitle}>{typeof title === "string" ? <T numberOfLines={1} style={[styles.tbH1, kind === "brand" && styles.tbBrand, kind === "big" && styles.tbBig]}>{title}</T> : title}</View>
      <View style={styles.tbSide}>{right}</View>
    </View>
  );
}

export const BackBtn = () => <TbBtn label="Quay lại" onPress={back}><Ic n="chevL" s={20} w={2} /></TbBtn>;
export const HelpBtn = () => <TbBtn label="Hướng dẫn sử dụng" onPress={ACT.help}><Ic n="help" s={20} /></TbBtn>;
export const BellBtn = () => <TbBtn label={unreadCount() ? `Thông báo, ${unreadCount()} chưa đọc` : "Thông báo"} dot={unreadCount() > 0} onPress={() => go("notifications")}><Ic n="bell" s={20} /></TbBtn>;
export const AvaBtn = () => <Avatar ini="TH" onPress={() => go("profile")} />;

/* topbar(t, right): right undefined → nút help; null → trống */
/* back={false}: màn gốc không có chỗ quay lại (ví dụ màn đồng ý điều khoản) — giữ chỗ để tiêu đề vẫn ở giữa */
export function TopBar({ title, right, back = true }: { title: string; right?: ReactNode | null; back?: boolean }) {
  return <Bar left={back ? <BackBtn /> : <View style={{ width: 42 }} />} title={title} right={right === undefined ? <HelpBtn /> : right ?? <View style={{ width: 42 }} />} />;
}
export const TabHead = ({ title, left }: { title: string; left?: ReactNode }) => <Bar kind="big" left={left ?? <BellBtn />} title={title} right={<AvaBtn />} />;
export const BrandHead = ({ title }: { title: string }) => <Bar kind="brand" left={<BellBtn />} title={title} right={<AvaBtn />} />;

/* ---------- Foot (.foot) ---------- */
export function Foot({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.foot, style]} pointerEvents="box-none">{children}</View>;
}

/* ---------- Skeleton (mạng chậm) ---------- */
function Sk({ h, w }: { h: number; w?: `${number}%` }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })); a.start(); return () => a.stop(); }, [v]);
  return <View style={{ height: h, width: w ?? "100%", borderRadius: 16, backgroundColor: C.soft, overflow: "hidden" }}>
    <Animated.View style={{ position: "absolute", top: 0, bottom: 0, width: "100%", experimental_backgroundImage: `linear-gradient(90deg, ${C.soft} 0%, #ffffff 50%, ${C.soft} 100%)`, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-400, 400] }) }] }} />
  </View>;
}
export const Skeleton = () => [<Sk key="a" h={24} w="55%" />, <Sk key="b" h={150} />, <Sk key="c" h={62} />, <Sk key="d" h={62} />, <Sk key="e" h={200} />];

/* ---------- ScreenView: .screen > deco + .tb + main.scroll + .foot ---------- */
export type ScreenSpec = { head?: ReactNode; body: ReactNode[]; foot?: ReactNode; nav?: boolean; noDeco?: boolean; bodyGap?: number };

export function ScreenView({ spec, enter, skel, swap }: { spec: ScreenSpec; enter: boolean; skel?: boolean; swap?: boolean }) {
  const scrolled = useRef(new Animated.Value(0)).current;
  const scroller = useRef<ScrollView>(null);
  const lastY = useRef(0);
  const isScrolled = useRef(false);
  useEffect(() => {
    if (!spec.nav) return;
    const f = () => scroller.current?.scrollTo({ y: 0, animated: true });
    scrollTopRequests.add(f); return () => { scrollTopRequests.delete(f); };
  }, [spec.nav]);
  useEffect(() => {
    const f = (y: number) => scroller.current?.scrollTo({ y, animated: true });
    scrollRequests.add(f); return () => { scrollRequests.delete(f); };
  }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y, dy = y - lastY.current; lastY.current = y;
    const s = y > 24;
    if (s !== isScrolled.current) { isScrolled.current = s; Animated.timing(scrolled, { toValue: s ? 1 : 0, duration: 300, useNativeDriver: true }).start(); }
    if (!spec.nav) return;
    const nearEnd = contentSize.height - layoutMeasurement.height - y < 8;
    if (y < 24) setTuck(false); else if (dy > 4 && !nearEnd) setTuck(true); else if (dy < -4) setTuck(false);
  };
  const items = (skel ? Skeleton() : spec.body.filter((x) => x !== null && x !== undefined && x !== false && x !== "")) as Array<ReactElement>;
  /* .in-push/.in-fade chỉ tồn tại 560 ms: phần tử xuất hiện sau đó (render không anim) không chạy rise */
  const born = useRef(Date.now());
  const swapAt = useRef(0);
  if (swap && !swapAt.current) swapAt.current = Date.now();
  const rising = (enter && Date.now() - born.current < 560) || (!!swap && Date.now() - swapAt.current < 560);
  return (
    <View style={styles.screen}>
      {spec.noDeco ? null : <Deco />}
      <ScrolledCtx.Provider value={scrolled}>{spec.head}</ScrolledCtx.Provider>
      <ScrollView ref={scroller} style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 20, paddingBottom: spec.nav ? 124 : 40, gap: spec.bodyGap ?? 22 }}>
        {items.map((it, i) => <Rise key={`${skel ? "sk" : "b"}${it.key ?? i}`} index={i} enabled={rising} duration={swap ? 450 : 550}>{it}</Rise>)}
      </ScrollView>
      {spec.foot}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: "#fff" },
  tb: { paddingHorizontal: 14, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 2 },
  tbSide: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  tbTitle: { flex: 1, alignItems: "center" },
  tbH1: { fontSize: 16, fontFamily: F.semibold, textAlign: "center" },
  tbBrand: { fontFamily: F.regular, fontSize: 15, letterSpacing: 2.1, textTransform: "uppercase" },
  tbBig: { fontSize: 22, fontFamily: F.bold, letterSpacing: -0.22 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 30, gap: 10, zIndex: 20, experimental_backgroundImage: "linear-gradient(0deg, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)" },
});
