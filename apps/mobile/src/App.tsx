import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Animated, Easing, Keyboard, LogBox, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Blur, BlurSource } from "./blur";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Montserrat_300Light, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold, useFonts,
} from "@expo-google-fonts/montserrat";
import { C, EASE, F, GL, SPRING, glass } from "./theme";
import { Gi, Ic, type IconName } from "./icons";
import { useShake } from "./motion";
import { T } from "./ui";
import { ScreenView, dockTuck, setTuck, type ScreenSpec } from "./screen";
import { SheetContent } from "./sheets";
import { hm } from "./data";
import { ACT, S, SKEL, TABS, closeSheet, cur, getVersion, jump, quickClose, quickItems, loadBioKind, restoreSession, simNow, subscribe, tab, toast, type Anim, type Route } from "./store";
import { QA_ENABLED, runQA } from "./qa";
import { NativeSplashGone, SplashOverlay } from "./splash";
import { CrashBoundary, installCrashHandler, takeLastCrash } from "./crash";

installCrashHandler();
import { Activate, Forgot, ForgotOtp, Login, Otp, ResetPassword, deviceSpec } from "./screens/auth";
import { clockSpec, homeSpec } from "./screens/home";
import { attendanceSpec } from "./screens/attendance";
import { explainSpec, leaveNewSpec, leaveSpec, otSpec } from "./screens/forms";
import { advanceDetailSpec, advanceNewSpec, advanceSpec, payslipSpec, payslipsSpec } from "./screens/money";
import { approvalDetailSpec, reqDetailSpec, requestsSpec } from "./screens/requests";
import { newsDetailSpec, newsSpec } from "./screens/news";
import { SpringHome, SpringLock, consentSpec, docsSpec, doneSpec, errSpec, notificationsSpec, profileSpec, securitySpec, widgetGuideSpec } from "./screens/profile";

if (QA_ENABLED) LogBox.ignoreAllLogs();

const RAW: Partial<Record<Route, () => ReactNode>> = {
  login: () => <Login />, forgot: () => <Forgot />, forgotOtp: () => <ForgotOtp />, resetPassword: () => <ResetPassword />, activate: () => <Activate />, otp: () => <Otp />,
  springHome: () => <SpringHome />, springLock: () => <SpringLock />,
};
const SPECS: Partial<Record<Route, () => ScreenSpec>> = {
  device: deviceSpec, home: homeSpec, clock: clockSpec, attendance: attendanceSpec, explain: explainSpec, leave: leaveSpec, leaveNew: leaveNewSpec, ot: otSpec,
  payslips: payslipsSpec, payslip: payslipSpec, advance: advanceSpec, advanceNew: advanceNewSpec, advanceDetail: advanceDetailSpec,
  requests: requestsSpec, reqDetail: reqDetailSpec, approvalDetail: approvalDetailSpec, news: newsSpec, newsDetail: newsDetailSpec,
  profile: profileSpec, docs: docsSpec, security: securitySpec, notifications: notificationsSpec, widgetGuide: widgetGuideSpec, done: doneSpec, err: errSpec, consent: consentSpec,
};
const LIGHT: Route[] = ["springHome", "springLock"];
const isNav = (r: Route) => TABS.includes(r);

/* ---------- Route view (đông cứng khi đang rời đi, như DOM cũ trong prototype) ---------- */
function RouteView({ route, enter, skel, swap, depth, restore }: { route: Route; enter: boolean; skel: boolean; swap: boolean; frozen: boolean; v: number; depth: number; restore: boolean }) {
  const raw = RAW[route];
  if (raw) return <>{raw()}</>;
  const spec = (SPECS[route] ?? homeSpec)();
  return <ScreenView spec={spec} enter={enter} skel={skel} swap={swap} memoKey={`${depth}:${route}`} restore={restore} />;
}
const FrozenRoute = memo(RouteView, (_p, n) => n.frozen);

type Layer = { id: number; seq: number; route: Route; anim: Anim | null; leaving: boolean; outAnim?: Anim | null; skel: boolean; depth: number };

function LayerView({ layer, active }: { layer: Layer; active: Route }) {
  const { width } = useWindowDimensions();
  const v = useRef(new Animated.Value(layer.anim ? 0 : 1)).current;
  const out = useRef(new Animated.Value(0)).current;
  const [skel, setSkel] = useState(layer.skel);
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (!layer.anim) return;
    Animated.timing(v, { toValue: 1, duration: layer.anim === "push" ? 400 : layer.anim === "pop" ? 340 : 300, easing: EASE, useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    if (!layer.leaving) return;
    const a = layer.outAnim;
    Animated.timing(out, { toValue: 1, duration: a === "push" ? 400 : a === "pop" ? 340 : 200, easing: a === "fade" ? Easing.ease : EASE, useNativeDriver: true }).start();
  }, [layer.leaving]);
  useEffect(() => {
    if (!layer.skel) return;
    const t = setTimeout(() => { setSkel(false); setSwap(true); }, 1200);
    return () => clearTimeout(t);
  }, []);
  const tf: Array<any> = [];
  let opacity: Animated.AnimatedInterpolation<number> | number = 1;
  if (layer.leaving) {
    const a = layer.outAnim;
    if (a === "push") { tf.push({ translateX: out.interpolate({ inputRange: [0, 1], outputRange: [0, -0.26 * width] }) }); opacity = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }); }
    else if (a === "pop") tf.push({ translateX: out.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) });
    else opacity = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  } else if (layer.anim === "push") tf.push({ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) });
  else if (layer.anim === "pop") { tf.push({ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-0.26 * width, 0] }) }); opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }); }
  else if (layer.anim === "fade") { opacity = v; tf.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }); }
  const z = layer.leaving ? (layer.outAnim === "pop" ? 2 : 1) : (layer.anim === "pop" ? 1 : 2);
  return (
    <Animated.View pointerEvents={layer.leaving ? "none" : "auto"} style={[StyleSheet.absoluteFill, { zIndex: z, opacity, transform: tf }, layer.leaving && layer.outAnim === "pop" && { boxShadow: "-20px 0px 40px rgba(10,40,30,0.12)" }]}>
      <FrozenRoute route={active} enter={layer.anim === "push" || layer.anim === "fade"} skel={skel} swap={swap} frozen={layer.leaving || layer.seq !== S.nav.seq} v={getVersion()} depth={layer.depth} restore={layer.anim === "pop"} />
    </Animated.View>
  );
}

let layerSeq = Date.now();
function Router() {
  const [layers, setLayers] = useState<Layer[]>(() => [{ id: ++layerSeq, seq: S.nav.seq, route: cur(), anim: null, leaving: false, skel: false, depth: S.stack.length }]);
  const seq = S.nav.seq;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const anim = S.nav.anim, r = cur();
    if (anim) setTuck(false);
    setLayers((prev) => [
      ...prev.filter((l) => l.leaving),
      ...prev.filter((l) => !l.leaving).map((l) => ({ ...l, leaving: true, outAnim: anim })),
      { id: ++layerSeq, seq, route: r, anim, leaving: false, skel: S.net === "slow" && !!anim && SKEL.includes(r), depth: S.stack.length },
    ]);
    const t = setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), 460);
    return () => clearTimeout(t);
  }, [seq]);
  /* Lớp đang hiển thị luôn vẽ cur(); lớp cũ đông cứng ngay từ lần render có điều hướng mới */
  const active = cur();
  return <View style={StyleSheet.absoluteFill}>{layers.map((l) => <LayerView key={l.id} layer={l} active={active} />)}</View>;
}

/* ---------- Dock ---------- */
const LABELS: Record<string, [IconName, string]> = { home: ["home", "Trang chủ"], attendance: ["cal", "Bảng công"], requests: ["file", "Đơn từ"], news: ["news", "Bản tin"] };

function DockItem({ id, on }: { id: string; on: boolean }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(v, { toValue: on ? 1 : 0, duration: 350, easing: EASE, useNativeDriver: false }).start(); }, [on]);
  const [icon, label] = LABELS[id]!;
  return (
    <Pressable accessibilityLabel={label} onPress={() => tab(id as Route)}>
      <Animated.View style={[styles.dk, { paddingHorizontal: v.interpolate({ inputRange: [0, 1], outputRange: [13, 15] }) }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dkOn, { opacity: v }]} />
        {on ? <Ic n={icon} s={24} w={1.8} g /> : <Ic n={icon} s={24} w={1.7} color={C.ink2} />}
        <Animated.View style={{ maxWidth: v.interpolate({ inputRange: [0, 1], outputRange: [0, 84] }), marginLeft: v.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }), opacity: v, overflow: "hidden" }}>
          <T numberOfLines={1} style={{ fontSize: 12.5, fontFamily: F.semibold, color: C.ink }}>{label}</T>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function Dock({ visible }: { visible: boolean }) {
  const gone = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const qopen = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(gone, { toValue: visible ? 0 : 1, duration: 450, easing: EASE, useNativeDriver: true }).start(); }, [visible]);
  useEffect(() => { Animated.timing(qopen, { toValue: S.quickOpen ? 1 : 0, duration: 300, easing: SPRING, useNativeDriver: true }).start(); }, [S.quickOpen]);
  const r = cur();
  const off = useMemo(() => Animated.add(gone, dockTuck).interpolate({ inputRange: [0, 1, 2], outputRange: [0, 98, 98] }), [gone]);
  return (
    <Animated.View pointerEvents={visible ? "box-none" : "none"} style={[styles.dock, { opacity: gone.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: off }] }]}>
      <Animated.View pointerEvents={S.quickOpen ? "none" : "auto"} style={[styles.pill, { opacity: qopen.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 32, overflow: "hidden" }]}>
          <Blur overlay intensity={40} />
          <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: "linear-gradient(155deg, rgba(255,255,255,0.62), rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.46))" }]} />
        </View>
        {TABS.map((t) => <DockItem key={t} id={t} on={r === t} />)}
      </Animated.View>
      <Pressable accessibilityLabel="Tạo nhanh" onPress={ACT.quick} style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.92 }] }]}>
        <Animated.View style={{ transform: [{ rotate: qopen.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}><Ic n="plus" s={28} w={2.2} color="#fff" /></Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Quick-create menu ---------- */
function QuickItem({ item, i, n, open }: { item: ReturnType<typeof quickItems>[number]; i: number; n: number; open: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) Animated.parallel([Animated.timing(v, { toValue: 1, duration: 500, delay: (n - 1 - i) * 38, easing: SPRING, useNativeDriver: true })]).start();
    else Animated.timing(v, { toValue: 0, duration: 200, easing: EASE, useNativeDriver: true }).start();
  }, [open]);
  return (
    <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
      <Pressable onPress={() => ACT.qgo(item[0])} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {({ pressed }) => <>
          <View style={[glass, { alignItems: "flex-end", borderRadius: 16, paddingVertical: 9, paddingHorizontal: 14 }]}>
            <T style={{ fontSize: 14, fontFamily: F.semibold, lineHeight: 18.2 }}>{item[2]}</T>
            <T style={{ fontSize: 11.5, fontFamily: F.medium, color: C.ink2, lineHeight: 15 }}>{item[3]}</T>
          </View>
          <View style={[glass, { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" }, pressed && { transform: [{ scale: 0.9 }] }]}><Gi n={item[1]} s={24} w={1.8} /></View>
        </>}
      </Pressable>
    </Animated.View>
  );
}
function QuickMenu() {
  const open = S.quickOpen;
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(v, { toValue: open ? 1 : 0, duration: 300, useNativeDriver: true }).start(() => { if (!open) setMounted(false); });
  }, [open]);
  if (!mounted) return null;
  const items = quickItems();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 38 }]} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={quickClose}>
          <Blur overlay intensity={60} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.42)" }]} />
        </Pressable>
      </Animated.View>
      <View pointerEvents="box-none" style={{ position: "absolute", right: 24, bottom: 104, alignItems: "flex-end", gap: 12 }}>
        {items.map((it, i) => <QuickItem key={it[0]} item={it} i={i} n={items.length} open={open} />)}
      </View>
    </View>
  );
}

/* ---------- Sheet ---------- */
function SheetHost() {
  const { height } = useWindowDimensions();
  const show = S.sheetShow;
  const last = useRef(S.sheet);
  if (S.sheet) last.current = S.sheet;
  const sheet = S.sheet ?? last.current;
  const v = useRef(new Animated.Value(0)).current;
  const kb = useRef(new Animated.Value(0)).current;
  const sh = useShake(S.shake.key === "sheet" ? S.shake.n : 0);
  const [sheetH, setSheetH] = useState(height * 0.6);
  const lastId = useRef(0);
  useEffect(() => {
    if (show) {
      if (S.sheet && S.sheet.id !== lastId.current) { lastId.current = S.sheet.id; v.setValue(0); }
      Animated.timing(v, { toValue: 1, duration: 460, easing: SPRING, useNativeDriver: true }).start();
    } else Animated.timing(v, { toValue: 0, duration: 300, easing: EASE, useNativeDriver: true }).start();
  }, [show, S.sheet?.id]);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => Animated.timing(kb, { toValue: e.endCoordinates.height, duration: e.duration || 250, useNativeDriver: true }).start());
    const b = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", (e) => Animated.timing(kb, { toValue: 0, duration: e.duration || 250, useNativeDriver: true }).start());
    return () => { a.remove(); b.remove(); };
  }, []);
  const slide = useMemo(() => v.interpolate({ inputRange: [0, 1], outputRange: [sheetH * 1.08 + 8, 0] }), [v, sheetH]);
  const kbUp = useMemo(() => Animated.multiply(kb, -1), [kb]);
  if (!S.sheet && !last.current) return null;
  const visible = !!S.sheet;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80 }]} pointerEvents={visible && show ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]}>
        <Pressable accessibilityLabel="Đóng" style={StyleSheet.absoluteFill} onPress={() => closeSheet()}>
          <Blur overlay intensity={30} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,40,30,0.16)" }]} />
        </Pressable>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: kbUp }] }]} pointerEvents="box-none">
      <Animated.View onLayout={(e) => setSheetH(e.nativeEvent.layout.height)} style={[styles.sheet, { maxHeight: height * 0.86, transform: [{ translateY: slide }, ...sh.transform] }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 34, overflow: "hidden" }]}>
          <Blur overlay intensity={50} />
          <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.88), rgba(255,255,255,0.7))" }]} />
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 26, gap: 16 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.line2, alignSelf: "center" }} />
          {sheet ? <SheetContent key={sheet.id} kind={sheet.kind} arg={sheet.arg} /> : null}
        </ScrollView>
      </Animated.View>
      </Animated.View>
    </View>
  );
}

/* ---------- Toast ---------- */
function Toast() {
  const insets = useSafeAreaInsets();
  const t = S.toast;
  const v = useRef(new Animated.Value(0)).current;
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!t) return;
    setMsg(t.msg);
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 450, easing: SPRING, useNativeDriver: true }).start();
    const h = setTimeout(() => Animated.timing(v, { toValue: 0, duration: 300, easing: EASE, useNativeDriver: true }).start(), 2800);
    return () => clearTimeout(h);
  }, [t?.id]);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { top: insets.top + 6, opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: "hidden" }]}>
        <Blur overlay intensity={40} />
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.9), rgba(255,255,255,0.66))" }]} />
      </View>
      <T style={{ fontSize: 13, fontFamily: F.medium, lineHeight: 18.2 }}>{msg}</T>
    </Animated.View>
  );
}

/* ---------- Netbar ---------- */
function NetBar() {
  const insets = useSafeAreaInsets();
  const net = S.net;
  const v = useRef(new Animated.Value(net === "online" ? 0 : 1)).current;
  const [shown, setShown] = useState(net);
  useEffect(() => {
    if (net !== "online") setShown(net);
    Animated.timing(v, { toValue: net === "online" ? 0 : 1, duration: 450, easing: SPRING, useNativeDriver: true }).start();
  }, [net]);
  if (shown === "online") return null;
  const slow = shown === "slow";
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", top: insets.top + 2, left: 0, right: 0, alignItems: "center", zIndex: 75, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }] }}>
      <View style={[styles.netbar, slow && { borderColor: "rgba(255,255,255,0.2)" }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: "hidden" }]}>
          <Blur overlay intensity={30} tint={slow ? "light" : "dark"} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: slow ? "rgba(255,241,214,0.82)" : "rgba(19,36,30,0.7)" }]} />
        </View>
        <Ic n={slow ? "signal" : "wifiOff"} s={16} w={slow ? 2.2 : 2} color={slow ? "#8A5300" : C.cream} />
        <T style={{ fontSize: 12.5, fontFamily: F.semibold, color: slow ? "#8A5300" : C.cream }}>{slow ? "Mạng chậm" : `Ngoại tuyến · dữ liệu lúc ${hm(simNow() - 360)}`}</T>
      </View>
    </Animated.View>
  );
}

/* ---------- Root ---------- */
function useStore() { return useSyncExternalStore(subscribe, getVersion); }

function KavorApp() {
  useStore();
  const [splash, setSplash] = useState(!QA_ENABLED);
  const [booted, setBooted] = useState(QA_ENABLED);
  useEffect(() => { if (!QA_ENABLED) restoreSession().finally(() => setBooted(true)); else void loadBioKind(); }, []);
  /* Báo lỗi của lần chạy trước (sau khi splash xong để toast không bị che) */
  useEffect(() => {
    if (splash || QA_ENABLED) return;
    void takeLastCrash().then((c) => { if (c) toast(`Lần trước app gặp lỗi: ${c.message.slice(0, 120)}`); });
  }, [splash]);
  /* Android: Montserrat đã nhúng native (plugin expo-font trong app.json). Nạp thêm lúc chạy làm bộ đo chữ
     và bộ vẽ chữ dùng hai typeface khác nhau, chữ bị ngắt dòng sai ("Đăng nhập" chỉ còn "Đăng"). */
  const [fonts] = useFonts(Platform.OS === "android" ? {} : { Montserrat_300Light, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const path = url.replace(/^[a-z.]+:\/\//i, "").replace(/^\/+/, "");
      const [head = "", rest] = (path.split(/[?#]/)[0] ?? "").split("/");
      if (head === "qa" && QA_ENABLED && rest) { runQA(rest); return; }
      if (["login", "home", "attendance", "requests", "news", "clock", "explain", "leave", "leaveNew", "ot", "payslips", "advance", "profile", "notifications", "widgetGuide", "approve"].includes(head)) jump(head);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  if (!fonts || !booted) return <SplashOverlay ready={false} onDone={() => {}} />;
  const r = cur();
  return (
    <View style={styles.root}>
      <StatusBar style={splash || LIGHT.includes(r) ? "light" : "dark"} animated />
      <BlurSource><Router /></BlurSource>
      <QuickMenu />
      <Dock visible={isNav(r)} />
      <NetBar />
      <SheetHost />
      <Toast />
      {splash ? <SplashOverlay ready onDone={() => setSplash(false)} /> : <NativeSplashGone />}
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><CrashBoundary><KavorApp /></CrashBoundary></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  dock: { position: "absolute", left: 18, right: 18, bottom: 24, flexDirection: "row", alignItems: "center", gap: 12, zIndex: 40 },
  pill: { flex: 1, height: 64, borderRadius: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.88)", boxShadow: GL.sh },
  dk: { height: 48, minWidth: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  dkOn: { borderRadius: 24, backgroundColor: "rgba(6,95,70,0.10)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.85), inset 0px 0px 0px 1px rgba(6,95,70,0.12)" },
  fab: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", experimental_backgroundImage: GL.tint, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.55), inset 0px -4px 10px rgba(0,40,28,0.35), 0px 16px 30px -12px rgba(6,95,70,0.6), 0px 0px 30px -6px rgba(52,211,153,0.5)" },
  sheet: { position: "absolute", left: 8, right: 8, bottom: 8, borderRadius: 34, borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", boxShadow: "inset 0px 1px 0px #fff, 0px -10px 40px -10px rgba(6,70,50,0.25)" },
  toast: { position: "absolute", left: 16, right: 16, zIndex: 90, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: "#fff", boxShadow: "0px 18px 40px -14px rgba(40,50,100,0.45)" },
  netbar: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", boxShadow: "0px 10px 24px -12px rgba(0,0,0,0.4)" },
});
