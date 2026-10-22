import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import { C, F, GL, EASE, glass, lh, tint } from "./theme";
import { Gi, Ic, type IconName } from "./icons";
import { Appear, usePick, usePress, useShake } from "./motion";
import { S } from "./store";
import { STATUS, type ReqStatus } from "./data";

/* ---------- Text: Montserrat, line-height 1.45 như body của prototype ---------- */
export function T({ style, children, ...p }: TextProps & { style?: StyleProp<TextStyle> }) {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const size = flat.fontSize ?? 14;
  /* Android đo thiếu bề rộng chữ có letterSpacing dương nên ngắt dòng và mất từ cuối (vd. "VÀO CA" chỉ còn "VÀO").
     Các chữ này đều là nhãn ngắn một dòng: dùng khoảng trắng không ngắt dòng và bù thêm bề rộng. */
  const spaced = Platform.OS === "android" && (flat.letterSpacing ?? 0) > 0;
  const fix = spaced && flat.width == null ? { paddingRight: Math.ceil((flat.letterSpacing ?? 0) * 2) } : null;
  /* Chữ co theo nội dung (khung = bề rộng đo được) không có chút dư nào; Android làm tròn khi vẽ nên chữ cuối bị đẩy xuống dòng
     rồi bị cắt ("Thiết bị này chưa được đăng ký" mất "ký"). Thêm một NBSP cuối chuỗi để khung rộng hơn vài pixel. */
  const single = spaced && (p.numberOfLines == null || p.numberOfLines === 1);
  const base = single && typeof children === "string" && children.length <= 40 ? children.replace(/ /g, "\u00A0") : children;
  const text = Platform.OS === "android" && typeof base === "string" ? base + "\u00A0" : base;
  /* Các chữ giãn ký tự đều là nhãn một dòng; ép 1 dòng để Android dùng đường đo/vẽ khớp nhau */
  const lines = spaced && p.numberOfLines == null ? { numberOfLines: 1 } : null;
  return <Text allowFontScaling={false} {...lines} {...p} style={[{ fontFamily: F.regular, fontSize: 14, color: C.ink, lineHeight: lh(size) }, style, fix]}>{text}</Text>;
}
/* text-wrap: balance — đo số dòng rồi thu hẹp khung để các dòng dài gần bằng nhau */
export function Balanced({ style, children, ...p }: TextProps & { style?: StyleProp<TextStyle> }) {
  const [maxW, setMaxW] = useState<number | undefined>();
  /* Android đo dòng lệch với lúc vẽ nên thu hẹp khung làm mất chữ cuối: chỉ cân dòng trên iOS */
  if (Platform.OS === "android") return <T {...p} style={style}>{children}</T>;
  const done = useRef(false);
  const self = (StyleSheet.flatten(style) as TextStyle | undefined)?.alignSelf ?? "center";
  return <T {...p} style={[style, maxW ? { maxWidth: maxW, alignSelf: self } : null]} onTextLayout={(e) => {
    if (done.current) return;
    done.current = true;
    const lines = e.nativeEvent.lines;
    if (lines.length < 2) return;
    const total = lines.reduce((s, l) => s + l.width, 0);
    setMaxW(Math.ceil(total / lines.length) + 16);
  }}>{children}</T>;
}
export const Num = ({ style, children, ...p }: TextProps & { style?: StyleProp<TextStyle> }) => <T {...p} style={[{ fontVariant: ["tabular-nums"] }, style]}>{children}</T>;

/* ---------- Spinner (.spin) ---------- */
export function Spinner({ size = 20, color = "#fff", width = 2.5 }: { size?: number; color?: string; width?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true })); a.start(); return () => a.stop(); }, [v]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color, borderRightColor: "transparent", transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }} />;
}

/* ---------- Buttons (.btn) ---------- */
type BtnKind = "primary" | "ghost" | "danger" | "auth";
export function Btn({ kind = "primary", sm, block, disabled, onPress, children, icon, spinKey, style, flex }: {
  kind?: BtnKind; sm?: boolean; block?: boolean; disabled?: boolean; onPress?: () => void; children?: ReactNode; icon?: ReactNode; spinKey?: string; style?: StyleProp<ViewStyle>; flex?: boolean;
}) {
  const press = usePress(0.975);
  const busy = !!spinKey && S.spin === spinKey;
  const color = kind === "ghost" ? C.ink : kind === "danger" ? C.bad : "#fff";
  return (
    <Animated.View style={[press.style, block && { alignSelf: "stretch" }, flex && { flex: 1 }, disabled && { opacity: 0.4 }, style]}>
      <Pressable disabled={disabled || busy} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button"
        style={[styles.btn, sm && styles.btnSm, kind === "primary" && styles.btnPrimary, kind === "ghost" && styles.btnGhost, kind === "danger" && styles.btnDanger, kind === "auth" && styles.btnAuth]}>
        {/* numberOfLines: bản Release Android có lúc ngắt dòng khi vẽ dù bề rộng đủ ("Đăng nhập" chỉ còn "Đăng") */}
        {busy ? <Spinner color={color} /> : <>{icon}{typeof children === "string" ? <T numberOfLines={1} style={[styles.btnText, sm && { fontSize: 13 }, { color }]}>{children}</T> : children}</>}
      </Pressable>
    </Animated.View>
  );
}
export const BtnRow = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: "row", gap: 10 }, style]}>{Children.map(children, (c) => c ? <View style={{ flex: 1 }}>{c}</View> : null)}</View>;

export function LinkBtn({ children, onPress, style, size = 13 }: { children: ReactNode; onPress?: () => void; style?: StyleProp<TextStyle>; size?: number }) {
  return <Pressable onPress={onPress} hitSlop={8}><T style={[{ color: C.emerald, fontFamily: F.semibold, fontSize: size }, style]}>{children}</T></Pressable>;
}

/* ---------- Card / rows ---------- */
export function Card({ children, pad, style }: { children: ReactNode; pad?: boolean; style?: StyleProp<ViewStyle> }) {
  const kids = Children.toArray(children).filter(Boolean);
  return <View style={[styles.card, pad && { padding: 18 }, style]}>{pad ? children : kids.map((k, i) => <Fragment key={i}>{i > 0 && isRow(k) && isRow(kids[i - 1]) ? <View style={styles.rowLine} /> : null}{k}</Fragment>)}</View>;
}
const isRow = (k: unknown) => isValidElement(k) && (k.type === Row || k.type === RowBtn || k.type === InfoRow);

export function InfoRow({ k, v, strong, vStyle }: { k: ReactNode; v: ReactNode; strong?: boolean; vStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.row}>
      <T style={[styles.rowK]}>{k}</T>
      {typeof v === "string" || typeof v === "number" ? <T style={[styles.rowR, strong && styles.rowStrong, vStyle]}>{v}</T> : v}
    </View>
  );
}
export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function RowBtn({ icon, title, sub, right, chev = true, onPress, titleStyle, disabled }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; chev?: boolean; onPress?: () => void; titleStyle?: StyleProp<TextStyle>; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.soft }]}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === "string" ? <T style={[styles.rowT, titleStyle]}>{title}</T> : title}
        {sub ? <T style={styles.rowS}>{sub}</T> : null}
      </View>
      {typeof right === "string" ? <T style={styles.rowR}>{right}</T> : right}
      {chev ? <Ic n="chevR" s={18} w={2} color={C.ink3} /> : null}
    </Pressable>
  );
}
export const RowStrong = ({ children }: { children: ReactNode }) => <Num style={[styles.rowR, styles.rowStrong]}>{children}</Num>;

export function St({ s, children, style }: { s: "ok" | "bad" | "warn" | "mute"; children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T numberOfLines={1} style={[styles.st, { color: s === "ok" ? C.ok : s === "bad" ? C.bad : s === "warn" ? C.warn : C.ink3 }, style]}>{children}</T>;
}
export const Tag = ({ st }: { st: ReqStatus }) => <St s={STATUS[st][1]}>{STATUS[st][0]}</St>;

export function SectionHead({ title, link, onLink, style }: { title: string; link?: string; onLink?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sh, style]}>
      <T style={styles.shT}>{title}</T>
      {link ? <LinkBtn onPress={onLink}>{link}</LinkBtn> : null}
    </View>
  );
}

export function Notice({ icon, title, sub, right, onPress }: { icon: ReactNode; title: string; sub: string; right?: ReactNode; onPress?: () => void }) {
  const press = usePress(0.985);
  return (
    <Animated.View style={press.style}>
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={styles.notice}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={styles.rowT}>{title}</T>
          <T style={styles.rowS}>{sub}</T>
        </View>
        {right}
      </Pressable>
    </Animated.View>
  );
}
export const Count = ({ n }: { n: number }) => <View style={[styles.count]}><T style={{ color: "#fff", fontSize: 12, fontFamily: F.semibold }}>{n}</T></View>;

export function Note({ icon, children, warn, style }: { icon: IconName; children: ReactNode; warn?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.note, warn && styles.noteWarn, style]}>
      <Ic n={icon} s={18} w={1.8} color={C.ink2} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T style={styles.noteT}>{children}</T> : children}</View>
    </View>
  );
}

export function ErrLine({ children, center, shakeKey }: { children: ReactNode; center?: boolean; shakeKey?: string }) {
  const sh = useShake(shakeKey && S.shake.key === shakeKey ? S.shake.n : 0);
  return (
    <Appear>
      <Animated.View style={[{ flexDirection: "row", gap: 6, alignItems: "center", justifyContent: center ? "center" : "flex-start" }, sh]}>
        <Ic n="alert" s={14} w={2} color={C.bad} />
        <T style={{ color: C.bad, fontSize: 12.5, fontFamily: F.medium, flexShrink: 1 }}>{children}</T>
      </Animated.View>
    </Appear>
  );
}

/* ---------- Chips / seg ---------- */
export function Chip({ on, label, onPress, style }: { on?: boolean; label: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const pick = usePick();
  return (
    <Animated.View style={[pick.style, style]}>
      <Pressable onPress={() => { pick.run(); onPress?.(); }} style={[styles.chip, on && styles.chipOn]}>
        {typeof label === "string" ? <T numberOfLines={1} style={[styles.chipT, on && styles.chipTOn]}>{label}</T> : label}
      </Pressable>
    </Animated.View>
  );
}
export function Chips({ wrap, children, style }: { wrap?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (wrap) return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, overflow: "visible" }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8, gap: 8 }}>
      {children}
    </ScrollView>
  );
}

export function Seg({ items, value, onChange }: { items: Array<[string, ReactNode]>; value: string; onChange: (v: string) => void }) {
  const idx = Math.max(0, items.findIndex((x) => x[0] === value));
  const [w, setW] = useState(0);
  const pos = useRef(new Animated.Value(idx)).current;
  useEffect(() => { Animated.timing(pos, { toValue: idx, duration: 360, easing: EASE, useNativeDriver: true }).start(); }, [idx, pos]);
  const n = items.length;
  const kw = w ? (w - 8 - (n - 1) * 2) / n : 0;
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {kw ? <Animated.View style={[styles.knob, { width: kw, transform: [{ translateX: pos.interpolate({ inputRange: [0, Math.max(1, n - 1)], outputRange: [0, Math.max(1, n - 1) * (kw + 2)] }) }] }]} /> : null}
      {items.map(([k, label]) => (
        <Pressable key={k} style={styles.segBtn} onPress={() => onChange(k)}>
          {typeof label === "string" ? <T numberOfLines={1} style={[styles.segT, k === value && styles.segTOn]}>{label}</T> : label}
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Form ---------- */
export const Form = ({ children }: { children: ReactNode }) => <View style={{ gap: 22 }}>{children}</View>;
export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}>{label ? <T style={styles.lbl}>{label}</T> : null}{children}</View>;
}
export function TextArea(p: TextInputProps & { minHeight?: number }) {
  const [focus, setFocus] = useState(false);
  return <TextInput allowFontScaling={false} multiline placeholderTextColor="#757575" textAlignVertical="top" {...p}
    onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
    style={[styles.ta, focus && styles.focus, { minHeight: p.minHeight ?? 92 }, p.style]} />;
}
export function Inp(p: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return <View style={[styles.inp, focus && styles.focus]}><TextInput allowFontScaling={false} placeholderTextColor="#757575" {...p} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }} style={styles.inpText} /></View>;
}
export function Stepper({ value, onMinus, onPlus, minusLabel, plusLabel }: { value: string; onMinus: () => void; onPlus: () => void; minusLabel: string; plusLabel: string }) {
  return (
    <View style={styles.stepper}>
      <StepBtn label="−" a11y={minusLabel} onPress={onMinus} />
      <Num style={{ fontSize: 20, fontFamily: F.medium }}>{value}</Num>
      <StepBtn label="+" a11y={plusLabel} onPress={onPlus} />
    </View>
  );
}
function StepBtn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [styles.stepBtn, pressed && { transform: [{ scale: 0.94 }] }]}><T style={{ fontSize: 20, color: C.ink2, lineHeight: 24 }}>{label}</T></Pressable>;
}

/* ---------- Avatar / top bar buttons ---------- */
export function Avatar({ ini, size = "md", onPress, style }: { ini: string; size?: "sm" | "md" | "lg" | "xl"; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const dims = ({ sm: [32, 11, 2], md: [42, 13, 2], lg: [84, 26, 4], xl: [104, 32, 5] } as Record<string, [number, number, number]>)[size]!;
  const body = (
    <View style={[{ width: dims[0], height: dims[0], borderRadius: dims[0] / 2, borderWidth: dims[2], borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", experimental_backgroundImage: GL.tint, boxShadow: size === "sm" ? undefined : size === "xl" ? `${GL.tintSh}, 0px 10px 24px -10px rgba(6,70,50,0.45)` : GL.tintSh }, style]}>
      <T style={{ color: "#fff", fontSize: dims[1], fontFamily: F.semibold }}>{ini}</T>
    </View>
  );
  return onPress ? <Pressable accessibilityLabel="Hồ sơ của tôi" onPress={onPress}>{body}</Pressable> : body;
}
export function TbBtn({ children, onPress, label, dot }: { children: ReactNode; onPress?: () => void; label: string; dot?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tbBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
      {children}
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

/* ---------- Timeline (.tl) ---------- */
export function Timeline({ steps, cur, allDone, fail }: { steps: Array<[string, string]>; cur: number; allDone?: boolean; fail?: boolean }) {
  return (
    <View>
      {steps.map((s, i) => {
        const st = fail && i === cur ? "fail" : (i < cur || allDone) ? "done" : i === cur ? "cur" : "";
        const last = i === steps.length - 1;
        return (
          <View key={i} style={{ flexDirection: "row", gap: 14, paddingBottom: last ? 0 : 20 }}>
            {!last ? <View style={[styles.tlLine, st === "done" && { experimental_backgroundImage: "linear-gradient(180deg, #34D399, #065F46)", backgroundColor: undefined }]} /> : null}
            <TlDot st={st} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: F.semibold }}>{s[0]}</T>
              <T style={{ color: C.ink2, fontSize: 12.5 }}>{st === "cur" ? "Đang chờ · " + s[1] : s[1]}</T>
            </View>
          </View>
        );
      })}
    </View>
  );
}
function TlDot({ st }: { st: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (st !== "cur") return;
    const a = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }), Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false })]));
    a.start(); return () => a.stop();
  }, [st, v]);
  const base: ViewStyle = { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.line2, backgroundColor: "#fff" };
  if (st === "done") return <View style={[base, { borderColor: "transparent", backgroundColor: undefined, experimental_backgroundImage: GL.gIn }]}><Ic n="check" s={12} w={3.2} color="#fff" /></View>;
  if (st === "fail") return <View style={[base, { backgroundColor: C.bad, borderColor: C.bad }]}><Ic n="x" s={12} w={3.2} color="#fff" /></View>;
  if (st === "cur") return (
    <View style={{ width: 24, height: 24 }}>
      <Animated.View style={{ position: "absolute", left: -5, top: -5, right: -5, bottom: -5, borderRadius: 17, backgroundColor: C.warnSoft, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }], opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }} />
      <View style={[base, { borderColor: C.warn }]} />
    </View>
  );
  return <View style={base} />;
}

/* ---------- Payslip line (.ln) ---------- */
export function Ln({ k, v, kind, sub, vStyle, kNode }: { k?: string; kNode?: ReactNode; v: ReactNode; kind?: "tot" | "net"; sub?: string; vStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[styles.ln, kind === "tot" && styles.lnTot, kind === "net" && styles.lnNet]}>
      <View style={{ flex: 1 }}>
        {kNode ?? <T style={[{ color: C.ink2 }, kind && { color: C.ink, fontFamily: F.bold }]}>{k}</T>}
        {sub ? <T style={{ color: C.ink3, fontSize: 11.5 }}>{sub}</T> : null}
      </View>
      {typeof v === "string" ? <Num style={[{ fontFamily: F.medium, textAlign: "right" }, kind === "tot" && { fontFamily: F.bold }, kind === "net" && { fontFamily: F.bold, fontSize: 20, color: C.emerald }, vStyle]}>{v}</Num> : v}
    </View>
  );
}
export const SecT = ({ children, style }: { children: string; style?: StyleProp<TextStyle> }) => <T style={[{ fontSize: 12, fontFamily: F.bold, letterSpacing: 0.96, textTransform: "uppercase", color: C.ink3, marginTop: 6, marginBottom: 2 }, style]}>{children}</T>;

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return <View style={{ alignItems: "center", gap: 10, paddingVertical: 36, paddingHorizontal: 20 }}>{icon}<T style={{ fontFamily: F.bold, fontSize: 16, textAlign: "center" }}>{title}</T>{text ? <T style={{ color: C.ink2, textAlign: "center" }}>{text}</T> : null}</View>;
}

export const GiIcon = Gi;

export const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: 27, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnSm: { height: 40, borderRadius: 20, paddingHorizontal: 16 },
  btnText: { fontSize: 15, fontFamily: F.semibold },
  btnPrimary: { ...tint, borderWidth: 0 },
  btnGhost: { ...glass },
  btnDanger: { experimental_backgroundImage: "linear-gradient(155deg, rgba(252,236,236,0.85), rgba(252,236,236,0.55))", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)", boxShadow: GL.sh },
  btnAuth: { minHeight: 60, height: 60, borderRadius: 30, experimental_backgroundImage: "linear-gradient(120deg, #087153, #0E8B67)", boxShadow: "0px 16px 32px -19px rgba(6,95,70,0.8)" },
  card: { ...glass, borderRadius: 22, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 12, paddingHorizontal: 18, width: "100%" },
  rowLine: { height: 1, backgroundColor: C.line, marginHorizontal: 18 },
  rowK: { flex: 1, color: C.ink2 },
  rowT: { fontFamily: F.semibold, fontSize: 14 },
  rowS: { color: C.ink2, fontSize: 12.5, marginTop: 2 },
  rowR: { color: C.ink2, textAlign: "right", fontSize: 13.5, flexShrink: 1 },
  rowStrong: { color: C.ink, fontFamily: F.semibold },
  st: { fontSize: 12.5, fontFamily: F.semibold },
  sh: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 2, marginBottom: -12 },
  shT: { fontSize: 16, fontFamily: F.bold },
  notice: { ...glass, flexDirection: "row", alignItems: "center", gap: 14, width: "100%", borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  count: { ...tint, borderWidth: 1, minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  note: { ...glass, flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  noteWarn: { experimental_backgroundImage: "linear-gradient(155deg, rgba(255,244,220,0.85), rgba(255,244,220,0.55))" },
  noteT: { fontSize: 13, color: C.ink2 },
  chip: { ...glass, height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 6 },
  chipOn: { ...tint, borderWidth: 1 },
  chipT: { fontSize: 13, fontFamily: F.medium, color: C.ink2 },
  chipTOn: { color: "#fff", fontFamily: F.semibold },
  seg: { ...glass, flexDirection: "row", borderRadius: 20, padding: 4, gap: 2 },
  knob: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.92)", boxShadow: "inset 0px 1px 0px #fff, 0px 6px 14px -6px rgba(6,70,50,0.35)" },
  segBtn: { flex: 1, height: 38, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segT: { fontSize: 13.5, fontFamily: F.medium, color: C.ink2 },
  segTOn: { color: C.ink, fontFamily: F.semibold },
  lbl: { fontSize: 13, fontFamily: F.semibold },
  inp: { ...glass, flexDirection: "row", alignItems: "center", gap: 10, height: 54, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5 },
  inpText: { flex: 1, fontSize: 15, fontFamily: F.medium, color: C.ink, padding: 0 },
  ta: { ...glass, borderWidth: 1.5, width: "100%", borderRadius: 16, paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16, fontSize: 14.5, color: C.ink, fontFamily: F.regular, lineHeight: 21 },
  focus: { backgroundColor: "rgba(255,255,255,0.88)", experimental_backgroundImage: undefined, borderColor: "rgba(6,95,70,0.45)" },
  stepper: { ...glass, flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 54, borderRadius: 16, paddingHorizontal: 6 },
  stepBtn: { ...glass, width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  tbBtn: { ...glass, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad, borderWidth: 2, borderColor: "#fff" },
  tlLine: { position: "absolute", left: 11, top: 24, bottom: 0, width: 2, backgroundColor: C.line },
  ln: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 9 },
  lnTot: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4, paddingTop: 12 },
  lnNet: { marginTop: 10, padding: 16, borderRadius: 16, experimental_backgroundImage: "linear-gradient(155deg, rgba(236,248,242,0.9), rgba(255,255,255,0.5))", borderWidth: 1, borderColor: "#fff" },
});
