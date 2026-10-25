import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { C, EASE, F, GL, glass } from "../theme";
import { Gi, Ic, type IconName } from "../icons";
import { Morph, useReducedMotion } from "../motion";
import { Card, Count, InfoRow, Notice, Num, Row, RowBtn, RowStrong, SectionHead, St, T } from "../ui";
import { BrandHead, TopBar, type ScreenSpec } from "../screen";
import { useClock } from "../clock";
import { CAT, dec, gh, hm, recentNews, relDay, vnd, advLimit } from "../data";
import { REMOTE } from "../api/http";
import { ACT, S, advEligible, ddmm, explainDue, fmtM, loadToday, explainLeft, go, holdDone, jump, lvAvail, pendingCount, phase, shiftLabel, shiftTime, tab, toast, worked } from "../store";

/* ================= Punch hero ================= */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Halo({ inset, style, delay, animate }: { inset: number; style: object; delay: number; animate: boolean }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate || reduced) { v.setValue(0.43); return; }
    let a: Animated.CompositeAnimation | null = null;
    const t = setTimeout(() => {
      a = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      a.start();
    }, delay);
    return () => { clearTimeout(t); a?.stop(); };
  }, [animate, reduced, v, delay]);
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -inset, left: -inset, right: -inset, bottom: -inset, borderRadius: 999 }, style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }) }] }]} />;
}

type PunchSt = "in" | "out" | "done" | "blocked";
const ORB: Record<PunchSt, object> = {
  in: { experimental_backgroundImage: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 30%), radial-gradient(circle at 68% 88%, rgba(167,243,208,0.5) 0%, rgba(167,243,208,0) 45%), linear-gradient(155deg, #12976F 0%, #065F46 70%, #044E39 100%)",
    boxShadow: "inset 0px 2px 1px rgba(255,255,255,0.55), inset 0px -12px 26px rgba(0,40,28,0.45), inset 0px 0px 0px 1.5px rgba(255,255,255,0.22), 0px 30px 46px -18px rgba(6,95,70,0.6)" },
  out: { experimental_backgroundImage: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 32%), linear-gradient(155deg, #D6FBEA 0%, #A7F3D0 60%, #84E5BA 100%)",
    boxShadow: "inset 0px 2px 1px rgba(255,255,255,0.85), inset 0px -12px 26px rgba(6,95,70,0.18), inset 0px 0px 0px 1.5px rgba(255,255,255,0.55), 0px 30px 46px -18px rgba(6,95,70,0.35)" },
  blocked: { experimental_backgroundImage: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 32%), linear-gradient(155deg, #D5DAD7, #AEB6B2)",
    boxShadow: "inset 0px 2px 1px rgba(255,255,255,0.6), inset 0px -10px 22px rgba(0,0,0,0.12), 0px 22px 36px -18px rgba(40,60,50,0.4)" },
  done: { experimental_backgroundImage: GL.fill, borderWidth: 1, borderColor: "#fff", boxShadow: GL.sh },
};
const BEFORE: Record<PunchSt, string> = {
  in: "linear-gradient(155deg, rgba(255,255,255,0.6), rgba(255,255,255,0.16))",
  out: "linear-gradient(155deg, rgba(255,255,255,0.6), rgba(255,255,255,0.16))",
  blocked: "linear-gradient(155deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15))",
  done: "linear-gradient(155deg, rgba(255,255,255,0.5), rgba(255,255,255,0.12))",
};
const AFTER: Record<PunchSt, object> = {
  in: { experimental_backgroundImage: "radial-gradient(circle closest-side, rgba(167,243,208,0.38) 73.5%, rgba(167,243,208,0) 100%)" },
  out: { backgroundColor: "rgba(167,243,208,0.14)" },
  blocked: { backgroundColor: "rgba(170,176,190,0.10)" },
  done: { backgroundColor: "rgba(59,181,101,0.05)" },
};

/* ::before/::after của .punch có z-index:-1 nên trong prototype chúng nằm DƯỚI lớp .map — vẽ riêng để đặt sau bản đồ */
export function PunchHalos({ size, compact, small }: { size: number; compact?: boolean; small?: boolean }) {
  const ph = phase();
  const st: PunchSt = ph === "done" ? "done" : !S.inRange ? "blocked" : ph;
  const ripple = useRef(new Animated.Value(1)).current;
  const before = compact ? 13 : small ? 10 : 20;
  const after = compact ? 26 : small ? 20 : 44;
  useEffect(() => {
    if (!S.justPunched) return;
    ripple.setValue(0);
    Animated.timing(ripple, { toValue: 1, duration: 800, easing: EASE, useNativeDriver: true }).start();
  }, [ph]);
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Halo inset={after} delay={500} animate={st !== "blocked"} style={AFTER[st]} />
      <Halo inset={before} delay={0} animate={st !== "blocked"} style={{ experimental_backgroundImage: BEFORE[st], borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", boxShadow: "inset 0px 1px 0px #fff, 0px 12px 30px -12px rgba(6,70,50,0.25)" }} />
      <Animated.View style={{ position: "absolute", top: -before, left: -before, right: -before, bottom: -before, borderRadius: 999, backgroundColor: "rgba(167,243,208,0.35)", opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.5] }) }] }} />
    </View>
  );
}

export function Punch({ size, compact, small, bare }: { size: number; compact?: boolean; small?: boolean; bare?: boolean }) {
  const ph = phase();
  const st: PunchSt = ph === "done" ? "done" : !S.inRange ? "blocked" : ph;
  const label = { in: "VÀO CA", out: "RA CA", done: small ? "XONG CA" : "ĐÃ XONG CA", blocked: "NGOÀI VÙNG" }[st];
  const sub = st === "in" || st === "out" ? (small ? "Giữ 1 giây" : "Nhấn giữ 1 giây") : st === "blocked" ? (small ? "" : "Chạm để xem cách xử lý") : "";
  const color = st === "out" ? C.emerald : st === "done" ? C.ok : "#fff";
  const holdable = st === "in" || st === "out";
  const ring = useRef(new Animated.Value(704)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Vừa giữ đủ 1 giây: lần thả tay ngay sau đó không tính là chạm (tránh toast "đã xong ca") */
  const held = useRef(false);
  const ringInset = compact ? 7 : small ? 6 : 9;
  const iconSize = compact ? 50 : small ? 40 : 64;

  const start = () => {
    held.current = false;
    if (!holdable) return;
    Animated.timing(scale, { toValue: 0.97, duration: 200, easing: EASE, useNativeDriver: true }).start();
    Animated.timing(ring, { toValue: 0, duration: 900, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => { timer.current = null; held.current = true; reset(); holdDone(); }, 900);
  };
  const reset = () => {
    Animated.timing(scale, { toValue: 1, duration: 200, easing: EASE, useNativeDriver: true }).start();
    ring.stopAnimation();
    Animated.timing(ring, { toValue: 704, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  };
  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; reset(); toast("Nhấn giữ nút tròn khoảng 1 giây để chấm công"); }
  };
  const press = () => {
    if (held.current) { held.current = false; return; }
    if (st === "done") { toast("Bạn đã hoàn thành ca hôm nay"); return; }
    if (st === "blocked") ACT.blockedTap();
  };

  const rs = size + ringInset * 2;
  return (
    <View style={{ width: size, height: size }}>
      {bare ? null : <View style={{ position: "absolute" }}><PunchHalos size={size} compact={compact} small={small} /></View>}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable accessibilityLabel={label} accessibilityRole="button" onPressIn={start} onPressOut={end} onPress={holdable ? undefined : press}
          style={[{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", gap: compact ? 6 : small ? 3 : 10 }, ORB[st]]}>
          <Ic n={st === "done" ? "tDone" : st === "blocked" ? "pin" : "tap"} s={iconSize} w={small ? 1.7 : 1.6} color={color} />
          <T numberOfLines={1} style={{ color, fontSize: compact ? 15 : small ? 13 : 17, fontFamily: F.semibold, letterSpacing: (compact ? 15 : 17) * 0.04, lineHeight: compact ? 20 : 24 }}>{label}</T>
          {sub ? <T style={{ color, opacity: 0.85, fontSize: small ? 10 : 11.5, fontFamily: F.medium, marginTop: small ? -1 : -6 }}>{sub}</T> : null}
        </Pressable>
      </Animated.View>
      <View pointerEvents="none" style={{ position: "absolute", top: -ringInset, left: -ringInset, width: rs, height: rs, transform: [{ rotate: "-90deg" }] }}>
        <Svg width={rs} height={rs} viewBox="0 0 230 230">
          <Defs><LinearGradient id="gR" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="230" y2="230"><Stop offset="0" stopColor="#2BB389" /><Stop offset="1" stopColor="#065F46" /></LinearGradient></Defs>
          <AnimatedCircle cx="115" cy="115" r="112" fill="none" stroke="url(#gR)" strokeWidth={4} strokeLinecap="round" strokeDasharray="704" strokeDashoffset={ring} />
        </Svg>
      </View>
    </View>
  );
}

const MAP_SQ: Array<[number, number, string]> = [[8, 30, "#E3F7EC"], [22, 70, "#DDF6EA"], [86, 18, "#E6F7EF"], [92, 64, "#EEF9F3"], [14, 88, "#D9F4E6"], [78, 90, "#E3F7EC"]];

export function Hero({ compact }: { compact?: boolean }) {
  const now = useClock();
  const w = worked();
  const ph = phase();
  return (
    <View style={{ alignItems: "center", paddingTop: compact ? 0 : 10 }}>
      <Num style={{ fontSize: compact ? 52 : 68, fontFamily: F.light, letterSpacing: (compact ? 52 : 68) * -0.02, lineHeight: compact ? 56 : 72, color: C.hero }}>{hm(now)}</Num>
      <T style={{ fontSize: compact ? 17 : 21, color: "#7A8781", marginTop: compact ? 4 : 8 }}>{REMOTE ? todayLabel() : "Thứ Sáu, 16 tháng 10"}</T>
      <View style={[glass, { marginTop: compact ? 8 : 10, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 }]}>
        <Ic n="clock" s={14} color={C.ink2} />
        <T style={{ fontSize: 12.5, fontFamily: F.medium, color: C.ink2 }}>{shiftLabel()} · {shiftTime()}</T>
      </View>
      <View style={{ width: "100%", height: compact ? 216 : 300, marginVertical: compact ? 0 : 4, alignItems: "center", justifyContent: "center" }}>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}><PunchHalos size={compact ? 160 : 204} compact={compact} /></View>
        <View pointerEvents="none" style={{ position: "absolute", top: 6, bottom: 6, left: -20, right: -20, opacity: 0.9, experimental_backgroundImage: "linear-gradient(32deg, transparent 46%, #ffffff 46%, #ffffff 50%, transparent 50%), linear-gradient(-58deg, transparent 47%, #ffffff 47%, #ffffff 50%, transparent 50%), radial-gradient(ellipse at center, #F2F6F4 0%, #F8FAF9 45%, rgba(255,255,255,0) 70%)" }}>
          {MAP_SQ.map(([x, y, c]) => <View key={`${x}${y}`} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 22, height: 22, borderRadius: 5, opacity: 0.75, backgroundColor: c }} />)}
        </View>
        <Morph trigger={ph}><Punch bare size={compact ? 160 : 204} compact={compact} /></Morph>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <Ic n="pin" s={18} w={2} color={S.inRange ? C.hero : C.bad} />
        <T style={{ fontSize: 14, fontFamily: F.medium, color: S.inRange ? C.hero : C.bad }}>{S.inRange ? `Vị trí: ${S.att.loc.name}` : "Bạn đang ở ngoài vùng chấm công"}</T>
      </View>
      <Morph trigger={ph} style={{ width: "100%", flexDirection: "row", marginTop: compact ? 12 : 26 }}>
        {([["tIn", S.clockIn ? hm(S.clockIn) : "--:--", "Vào ca"], ["tOut", S.clockOut ? hm(S.clockOut) : "--:--", "Ra ca"], ["tDone", w === null ? "--:--" : gh(w), "Giờ làm"]] as Array<[IconName, string, string]>).map(([icon, v, l]) => (
          <View key={l} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <Gi n={icon} s={compact ? 28 : 34} w={1.6} />
            <Num style={{ fontSize: compact ? 19 : 22, fontFamily: F.bold, marginTop: compact ? 2 : 6 }}>{v}</Num>
            <T style={{ fontSize: compact ? 12 : 13, color: C.ink3, fontFamily: F.medium }}>{l}</T>
          </View>
        ))}
      </Morph>
    </View>
  );
}

/* ================= News carousel ================= */
function NewsCarousel() {
  const list = recentNews(S.news);
  const { width } = useWindowDimensions();
  const sideness = width / 2 - 130;
  const step = 310;
  const first = sideness + 150 - width / 2;
  const ref = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(S.ncIdx || 0);
  const hold = useRef(0);
  const idxRef = useRef(idx);
  /* contentOffset chỉ dùng lúc mount: đổi prop này khi đang cuộn sẽ làm thẻ bị lệch tâm */
  const initialOffset = useRef({ x: first + idx * step, y: 0 });
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    idxRef.current = idx; S.ncIdx = idx;
    progress.setValue(0);
    if (!reduced) Animated.timing(progress, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }).start();
  }, [idx]);
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() - hold.current < 3000 || S.quickOpen || S.sheet) return;
      const n = (idxRef.current + 1) % list.length;
      ref.current?.scrollTo({ x: first + n * step, animated: true });
    }, 4000);
    return () => clearInterval(t);
  }, [list.length, first]);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 2 }}>
        <T style={{ fontSize: 16, fontFamily: F.bold }}>Bản tin mới</T>
        <Pressable hitSlop={8} onPress={() => tab("news")}><T style={{ color: C.emerald, fontFamily: F.semibold, fontSize: 13 }}>Tất cả</T></Pressable>
      </View>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToOffsets={list.map((_, i) => first + i * step)}
        contentOffset={initialOffset.current} scrollEventThrottle={16}
        onScrollBeginDrag={() => { hold.current = Date.now(); }}
        onScroll={(e) => { const i = Math.max(0, Math.min(list.length - 1, Math.round((e.nativeEvent.contentOffset.x - first) / step))); if (i !== idxRef.current) setIdx(i); }}
        style={{ marginHorizontal: -20, marginTop: -8, marginBottom: -22, overflow: "visible" }}
        contentContainerStyle={{ paddingHorizontal: sideness, paddingTop: 8, paddingBottom: 34, gap: 10 }}>
        {list.map((n, i) => <NcCard key={n.id} id={n.id} act={i === idx} imp={!!n.important} icon={CAT[n.cat][1]} cat={CAT[n.cat][0]} date={relDay(n.date)} title={n.title} />)}
      </ScrollView>
      {list.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", marginTop: -6 }}>
          {list.map((_, i) => i === idx ? (
            <View key={i} style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: "rgba(6,95,70,0.22)", overflow: "hidden" }}>
              <Animated.View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, borderRadius: 3, backgroundColor: C.emerald, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }} />
            </View>
          ) : <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.line2 }} />)}
        </View>
      ) : null}
    </View>
  );
}

function NcCard({ id, act, imp, icon, cat, date, title }: { id: number; act: boolean; imp: boolean; icon: IconName; cat: string; date: string; title: string }) {
  const v = useRef(new Animated.Value(act ? 1 : 0)).current;
  useEffect(() => { Animated.timing(v, { toValue: act ? 1 : 0, duration: 450, easing: EASE, useNativeDriver: true }).start(); }, [act]);
  return (
    <Animated.View style={{ width: 300, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
      <Pressable onPress={() => { S.param = String(id); go("newsDetail"); }}
        style={({ pressed }) => [glass, { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, minHeight: 84 },
          imp && { experimental_backgroundImage: "linear-gradient(155deg, rgba(255,234,235,0.92) 0%, rgba(255,255,255,0.55) 62%)", borderColor: "rgba(255,214,216,0.95)" }, pressed && { transform: [{ scale: 0.98 }] }]}>
        <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: imp ? "rgba(255,236,237,0.98)" : "rgba(236,248,242,0.95)", boxShadow: "inset 0px 1px 0px #fff" }}>
          {imp ? <Ic n={icon} s={24} w={1.8} color={C.bad} /> : <Gi n={icon} s={24} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {imp ? <ImpTag /> : <T style={styles.ncMeta}>{cat}</T>}
            <T style={styles.ncMeta}>· {date}</T>
          </View>
          <T numberOfLines={2} style={{ fontSize: 14.5, fontFamily: F.semibold, lineHeight: 19.6 }}>{title}</T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* shrink: trong danh sách bản tin, dòng meta của tin ghim quá dài nên nhãn bị co và xuống dòng như prototype */
export const ImpTag = ({ shrink }: { shrink?: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingLeft: 6, paddingRight: 8, borderRadius: 8, backgroundColor: C.bad, flexShrink: shrink ? 1 : 0, width: shrink ? 72 : undefined }}>
    <Ic n="alert" s={11} w={2.6} color="#fff" />
    <T numberOfLines={shrink ? 2 : 1} style={{ color: "#fff", fontSize: 11, fontFamily: F.bold, letterSpacing: 0.11, lineHeight: 16, flexShrink: 1 }}>Quan trọng</T>
  </View>
);

/* ================= Screens ================= */
export function homeSpec(): ScreenSpec {
  const n = pendingCount(), due = REMOTE ? explainDue() : null;
  const advR = REMOTE ? (!S.advData ? "—" : S.advData.ineligible ? "Không áp dụng" : S.advData.current ? "Đã dùng" : vnd(S.advData.limit))
    : advEligible() ? "Không áp dụng" : S.advance ? "Đã dùng" : vnd(advLimit());
  const shorts: Array<[string, IconName, string]> = [["leaveNew", "plane", "Xin nghỉ"], ["explain", "clock", "Giải trình"], ["ot", "moon", "Làm thêm"], ["advance", "cash", "Tạm ứng"], ["payslips", "receipt", "Phiếu lương"], ["profile", "user", "Hồ sơ"], ["widgetGuide", "grid", "Widget"], ["notifications", "bell", "Thông báo"]];
  return {
    nav: true,
    head: <BrandHead title="Hải Đăng Group" />,
    body: [
      <NewsCarousel key="nc" />,
      <Hero key="hero" compact />,
      n ? <Notice key="ap" icon={<Gi n="checks" s={26} />} title="Cần bạn duyệt" sub={REMOTE ? "Giải trình công" : "Nghỉ phép, tạm ứng, giải trình công"} right={<Count n={n} />} onPress={() => jump("approve")} /> : null,
      REMOTE ? (due ? <Notice key="ex" icon={<Gi n="hour" s={26} />} title={`Hạn giải trình công: ${ddmm(due.deadline)}`} sub={`Ngày ${ddmm(due.date)} ${due.issue} · ${due.daysLeft ? `còn ${due.daysLeft} ngày` : "hạn hôm nay"}`} right={<St s="warn">{explainLeft()}/{S.explainLimit} lượt</St>} onPress={() => go("explain")} /> : null)
        : <Notice key="ex" icon={<Gi n="hour" s={26} />} title="Hạn giải trình công: 22/10" sub="Ngày 15/10 thiếu giờ vào · còn 6 ngày" right={<St s="warn">{explainLeft()}/3 lượt</St>} onPress={() => go("explain")} />,
      <SectionHead key="sh" title="Của bạn" />,
      <Card key="mine">
        <RowBtn icon={<Gi n="plane" s={24} />} title="Phép năm còn lại" right={<RowStrong>{dec(lvAvail())} ngày</RowStrong>} onPress={() => go("leave")} />
        <RowBtn icon={<Gi n="cash" s={24} />} title="Hạn mức tạm ứng" right={<RowStrong>{advR}</RowStrong>} onPress={() => go("advance")} />
        <RowBtn icon={<Gi n="receipt" s={24} />} title="Phiếu lương 09/2026" right="Đã công bố" onPress={() => go("payslips")} />
      </Card>,
      <Card key="short" style={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: 20, paddingHorizontal: 10, rowGap: 20 }}>
        {shorts.map(([r, icon, label]) => <Short key={r} r={r} icon={icon} label={label} />)}
      </Card>,
    ],
  };
}

function Short({ r, icon, label }: { r: string; icon: IconName; label: string }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable style={{ width: "25%", alignItems: "center", gap: 9 }} onPress={() => go(r as never)}
      onPressIn={() => Animated.timing(s, { toValue: 0.85, duration: 200, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }).start()}>
      <Animated.View style={{ transform: [{ scale: s }] }}><Gi n={icon} s={28} w={1.6} /></Animated.View>
      <T style={{ fontSize: 12, fontFamily: F.medium, color: C.ink2, textAlign: "center" }}>{label}</T>
    </Pressable>
  );
}

const WDV = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const todayLabel = () => { const d = new Date(); return `${WDV[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}`; };

/* Bản thật: mở màn chấm công thì đọc lại vị trí/khoảng cách (không xin quyền ở đây) */
function ClockSync() {
  useEffect(() => { if (REMOTE) void loadToday(); }, []);
  return null;
}

export function clockSpec(): ScreenSpec {
  const a = S.att;
  const dist = REMOTE
    ? (a.distM == null ? "Chưa có vị trí" : `${fmtM(a.distM)} · ${S.inRange ? "trong vùng" : "ngoài vùng"}`)
    : (S.inRange ? "1,8 m · trong vùng" : "126 m · ngoài vùng");
  return {
    head: <TopBar title="Chấm công" />,
    body: [
      <Hero key="hero" />,
      <Card key="c">
        <Row>
          <Gi n="building" s={24} />
          <View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold }}>{a.loc.name}</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>{a.loc.address ? a.loc.address + " · " : ""}bán kính {a.loc.radiusM} m</T></View>
        </Row>
        <InfoRow k="Khoảng cách" v={<St s={REMOTE && a.distM == null ? "mute" : S.inRange ? "ok" : "bad"}>{dist}</St>} />
        <InfoRow k="Độ chính xác GPS" v={REMOTE ? (a.accM == null ? "—" : `±${Math.round(a.accM)} m`) : "±2 m"} strong />
        <InfoRow k="Thiết bị" v={`${a.device} · đã đăng ký`} strong />
        {REMOTE && a.queued ? <InfoRow k="Chờ gửi" v={<St s="warn">{a.queued} lần lưu trên máy</St>} /> : null}
        <ClockSync />
      </Card>,
    ],
  };
}

const styles = StyleSheet.create({
  ncMeta: { fontSize: 12, color: C.ink3, fontFamily: F.medium },
});
