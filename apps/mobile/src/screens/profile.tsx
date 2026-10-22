import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { Blur } from "../blur";
import Svg, { Circle } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, GL, SPRING, glass } from "../theme";
import { Gi, Ic, Logo, type IconName } from "../icons";
import { Illus } from "../illus";
import { Rise, useShake } from "../motion";
import { Avatar, Balanced, Btn, BtnRow, Card, InfoRow, Note, Notice, Row, RowBtn, SectionHead, Spinner, T, Timeline } from "../ui";
import { Foot, TopBar, type ScreenSpec } from "../screen";
import { useClock } from "../clock";
import { dec, gh, hm } from "../data";
import { ACT, S, go, jump, setBioPref, lvAvail, phase, toast, worked, type ErrKind, type Route } from "../store";

const COVER = '<svg viewBox="0 0 320 124" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="pfSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFF5E4"/><stop offset="1" stop-color="#F3FCF8"/></linearGradient></defs><rect width="320" height="124" fill="url(#pfSky)"/><circle cx="252" cy="36" r="15" fill="#FFF4D6"/><path d="M0 22c18 8 30 30 34 58l6 44H0z" fill="#2E9C77" opacity=".55"/><path d="M320 14c-20 10-34 34-38 64l-4 46h42z" fill="#2E9C77" opacity=".55"/><path d="M0 80c40-20 70-16 110-8s80-18 120-10 60 0 90-8v70H0z" fill="#A7F3D0"/><path d="M0 96c50-14 100-4 150-10s90-14 170 0v42H0z" fill="#34C79A"/><path d="M0 108c60-8 120 4 190-4s90-4 130 2v18H0z" fill="#0B7A5A"/></svg>';
const VERIFIED = '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#065F46"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function PfCard() {
  return (
    <View style={styles.pf}>
      <View style={styles.cover}><SvgXml xml={COVER} width="100%" height="100%" /></View>
      <View style={{ marginTop: -54 }}><Avatar ini="TH" size="xl" /></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 2 }}>
        <T style={{ fontSize: 22, fontFamily: F.bold }}>Trần Thu Hà</T>
        <SvgXml xml={VERIFIED} width={20} height={20} />
      </View>
      <T style={{ fontSize: 13, color: C.ink2, fontFamily: F.medium }}>Senior Designer · Marketing · HD0142</T>
      <View style={{ flexDirection: "row", width: "100%", marginTop: 18, marginBottom: 16 }}>
        {([["star", "5 năm", "Thâm niên"], ["plane", dec(lvAvail()), "Ngày phép"], ["cal", "10/22", "Ngày công"]] as Array<[IconName, string, string]>).map(([icon, b, s], i) => (
          <View key={s} style={[{ flex: 1, alignItems: "center", gap: 3 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: "rgba(6,95,70,0.12)" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Gi n={icon} s={16} w={2} /><T style={{ fontSize: 17, fontFamily: F.bold }}>{b}</T></View>
            <T style={{ fontSize: 12, color: C.ink3, fontFamily: F.medium }}>{s}</T>
          </View>
        ))}
      </View>
      <Btn block style={{ alignSelf: "stretch", marginHorizontal: 8 }} onPress={ACT.editProfile}>Đề nghị sửa thông tin</Btn>
    </View>
  );
}

export function profileSpec(): ScreenSpec {
  return {
    head: <TopBar title="Hồ sơ" right={null} />,
    body: [
      <PfCard key="pf" />,
      <Notice key="n" icon={<Gi n="hour" s={26} />} title="Đổi tài khoản ngân hàng đang chờ HR" sub="Lương kỳ này vẫn vào Vietcombank •6789" right={<Ic n="chevR" s={18} w={2} color={C.ink3} />} onPress={() => { S.param = "HS-0221"; go("reqDetail"); }} />,
      <SectionHead key="sh1" title="Công việc" />,
      <Card key="job"><InfoRow k="Phòng ban" v="Marketing" strong /><InfoRow k="Quản lý trực tiếp" v="Lê Quang Huy" strong /><InfoRow k="Ngày vào làm" v="03/03/2021" strong /><InfoRow k="Hợp đồng" v={S.contract === "probation" ? "Thử việc · đến 30/11" : S.contract === "leaving" ? "Nghỉ từ 15/11/2026" : "Chính thức"} strong /></Card>,
      <SectionHead key="sh2" title="Cá nhân" link="Đề nghị sửa" onLink={ACT.editProfile} />,
      <Card key="me"><InfoRow k="Điện thoại" v="0912 ••• 468" strong /><InfoRow k="Email" v="ha.tran@haidang.vn" strong /><InfoRow k="Địa chỉ" v="Tân Định, TP.HCM" strong /><InfoRow k="Liên hệ khẩn cấp" v="Trần Văn Bình" strong /><InfoRow k="Ngân hàng" v="Vietcombank •6789" strong /></Card>,
      <Card key="links">
        <RowBtn icon={<Gi n="doc" s={24} />} title="Hợp đồng và quyết định" onPress={() => toast("P05–P06: hợp đồng, quyết định và trình xem PDF")} />
        <RowBtn icon={<Gi n="grid" s={24} />} title="Widget chấm công" onPress={() => go("widgetGuide")} />
        <RowBtn icon={<Gi n="shield" s={24} />} title="Bảo mật và thiết bị" onPress={() => go("security")} />
        <RowBtn icon={<Gi n="bell" s={24} />} title="Thông báo" onPress={() => toast("U02: nhắc chấm công, hạn giải trình, kết quả duyệt, phiếu lương, bản tin.")} />
        <RowBtn icon={<Ic n="logout" s={24} w={1.7} color={C.bad} />} title="Đăng xuất" titleStyle={{ color: C.bad }} chev={false} onPress={ACT.logoutAsk} />
      </Card>,
    ],
  };
}

export function notificationsSpec(): ScreenSpec {
  const items: Array<[number, IconName, string, string, string]> = [[1, "hour", "Còn 6 ngày để giải trình công tháng 10", "Ngày 15/10 thiếu giờ vào. Hạn 22/10.", "08:00"], [1, "checks", "Đơn OT-0418 đã được duyệt", "Lê Quang Huy duyệt làm thêm ngày 14/10.", "Hôm qua"],
    [0, "news", "Bản tin mới: chấm công GPS", "Phòng Nhân sự vừa đăng một chính sách.", "15/10"], [0, "receipt", "Phiếu lương 09/2026 đã công bố", "Xác thực để xem chi tiết.", "05/10"], [0, "cash", "Tạm ứng TU-0912 đã chi", "3.000.000 ₫ vào Vietcombank •6789.", "12/09"]];
  return {
    head: <TopBar title="Thông báo" right={null} />,
    body: [
      <Card key="c">{items.map((n) => (
        <Row key={n[2]} style={{ alignItems: "flex-start" }}>
          <Gi n={n[1]} s={24} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={{ fontFamily: F.semibold }}>{n[2]}{n[0] ? <T>{"  "}</T> : null}{n[0] ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.emerald, marginBottom: 1 }} /> : null}</T>
            <T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>{n[3]}</T>
          </View>
          <T style={{ color: C.ink3, fontSize: 12 }}>{n[4]}</T>
        </Row>
      ))}</Card>,
    ],
  };
}

/* ---------- Widget ---------- */
export function Wall({ style }: { style?: object }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden", experimental_backgroundImage: "linear-gradient(200deg, #0B6E52 0%, #13896A 45%, #58C79C 100%)" }, style]}>
      <View style={{ position: "absolute", width: 420, height: 420, borderRadius: 210, left: -160, top: 380, backgroundColor: "rgba(255,255,255,0.14)" }} />
      <View style={{ position: "absolute", width: 300, height: 300, borderRadius: 150, right: -120, top: -60, backgroundColor: "rgba(255,255,255,0.12)" }} />
    </View>
  );
}

function GlassFill({ radius, intensity = 26, fill }: { radius: number; intensity?: number; fill: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      <Blur intensity={intensity} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: fill }]} />
    </View>
  );
}
const WDG_FILL = "linear-gradient(155deg, rgba(255,255,255,0.34), rgba(255,255,255,0.12) 55%, rgba(255,255,255,0.24))";

function WidgetMed({ style }: { style?: object }) {
  const now = useClock();
  const ph = phase(), ws = S.widgetState;
  let cls = ph === "out" ? "out" : "", lbl = ph === "out" ? "RA CA" : "VÀO CA", icn: IconName = "tap";
  if (!S.inRange && ph !== "done") { cls = "off"; lbl = "NGOÀI VÙNG"; icn = "pin"; }
  if (ph === "done") { cls = "ok"; lbl = "XONG CA"; icn = "tDone"; }
  const busy = ws === "busy";
  if (busy) lbl = "ĐANG GỬI";
  if (ws === "ok") { cls = "ok"; lbl = "ĐÃ GHI"; icn = "check"; }
  const status = ws === "ok" ? (S.clockOut ? "Đã ra ca " + hm(S.clockOut) : "Đã vào ca " + hm(S.clockIn!)) : ph === "out" ? `Trong ca từ ${hm(S.clockIn!)}` : ph === "done" ? `${hm(S.clockIn!)} – ${hm(S.clockOut!)}` : "Thứ Sáu, 16/10";
  const btnBg = cls === "out" ? { experimental_backgroundImage: "linear-gradient(155deg, rgba(214,251,234,0.96), rgba(167,243,208,0.9))", boxShadow: GL.tintSh } : cls === "off" ? { backgroundColor: "rgba(255,255,255,0.22)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.5)" } : cls === "ok" ? { experimental_backgroundImage: "linear-gradient(225deg, #3BB565, #6CCB8C)", boxShadow: GL.tintSh } : { experimental_backgroundImage: GL.tint, boxShadow: GL.tintSh };
  const fg = cls === "out" ? C.emerald : cls === "off" ? "rgba(255,255,255,0.85)" : "#fff";
  return (
    <View style={[styles.wdg, styles.wdgMed, style]}>
      <GlassFill radius={24} fill={WDG_FILL} />
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Logo size={16} /><T style={styles.wh}>Kavor</T></View>
        <T style={{ fontSize: 38, lineHeight: 38, fontFamily: F.light, color: "#fff", fontVariant: ["tabular-nums"] }}>{hm(now)}</T>
        <T style={styles.ws}>{status}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Ic n="pin" s={13} w={2.2} color={S.inRange ? "#B8F5D9" : "#FFC2C6"} /><T style={{ fontSize: 11.5, fontFamily: F.semibold, color: S.inRange ? "#B8F5D9" : "#FFC2C6" }}>{S.inRange ? "Trong vùng · 1,8 m" : "Cách văn phòng 126 m"}</T></View>
      </View>
      <View style={{ width: 104, height: 104 }}>
        <View pointerEvents="none" style={{ position: "absolute", top: -8, left: -8, right: -8, bottom: -8, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.14)" }} />
        <Pressable accessibilityLabel={lbl} onPress={ACT.wpunch} style={({ pressed }) => [styles.wbtn, btnBg, pressed && { transform: [{ scale: 0.94 }] }]}>
          {busy ? <Spinner size={24} color="#fff" /> : <Ic n={icn} s={30} w={1.8} color={fg} />}
          <T style={{ fontSize: 12, fontFamily: F.bold, letterSpacing: 0.48, color: fg }}>{lbl}</T>
        </Pressable>
      </View>
    </View>
  );
}

export function widgetGuideSpec(): ScreenSpec {
  return {
    head: <TopBar title="Widget chấm công" />,
    body: [
      <View key="w" style={{ borderRadius: 26, overflow: "hidden", padding: 20 }}><Wall /><WidgetMed /></View>,
      <SectionHead key="sh" title="Thêm widget trên iPhone" />,
      <Card key="tl" pad><Timeline allDone cur={3} steps={[["Nhấn giữ vùng trống trên màn hình chính", "Chọn Sửa → Thêm tiện ích"], ["Tìm “Kavor”, chọn cỡ vừa", "Cỡ vừa có nút chấm công, cỡ nhỏ chỉ xem trạng thái"], ["Đến văn phòng và chạm Vào ca", "Widget kiểm tra vị trí rồi báo kết quả tại chỗ"]]} /></Card>,
      <View key="n" style={[glass, { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 }]}>
        <Ic n="shield" s={18} w={1.8} color={C.ink2} style={{ marginTop: 1 }} />
        <T style={{ flex: 1, fontSize: 13, color: C.ink2 }}>Widget chỉ chạy trên thiết bị đã đăng ký và khi bạn còn đăng nhập. Mỗi lần chạm đều xác thực vị trí.</T>
      </View>,
      <BtnRow key="b"><Btn kind="ghost" sm onPress={() => jump("springLock")}>Màn hình khóa</Btn><Btn sm onPress={() => jump("springHome")}>Xem mô phỏng</Btn></BtnRow>,
    ],
  };
}

/* ---------- Springboard (mô phỏng màn hình chính / khóa) ---------- */
function SbApp({ name, icon, onPress, logo }: { name?: string; icon?: IconName; onPress?: () => void; logo?: boolean }) {
  const body = (
    <View style={{ alignItems: "center", gap: 6 }}>
      {logo ? <Logo size={60} /> : (
        <View style={styles.sbIcon}>
          <GlassFill radius={15} intensity={18} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" />
          <Ic n={icon!} s={26} w={1.6} color="#fff" />
        </View>
      )}
      {name ? <T style={styles.sbName}>{name}</T> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityLabel="Mở app Kavor" onPress={onPress}>{body}</Pressable> : body;
}

function Notif() {
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(S.inRange && !S.clockIn)) return;
    const t = setTimeout(() => { S.notifShow = true; Animated.timing(v, { toValue: 1, duration: 600, easing: SPRING, useNativeDriver: true }).start(); }, 1000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (!S.notifShow) Animated.timing(v, { toValue: 0, duration: 400, useNativeDriver: true }).start(); });
  return (
    <Animated.View style={[styles.notif, { top: insets.top + 6, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) }] }]}>
      <GlassFill radius={24} fill="linear-gradient(0deg, rgba(255,255,255,0.86), rgba(255,255,255,0.86))" />
      <Pressable onPress={ACT.notifTap} style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 }}>
        <Logo size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T style={{ fontSize: 13, fontFamily: F.semibold }}>Kavor</T><T style={{ fontSize: 13, color: C.ink3 }}>bây giờ</T></View>
          <T style={{ fontSize: 13, color: C.ink2, lineHeight: 17.5 }}>Bạn đã đến Văn phòng Quận 1. Chạm để vào ca.</T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function SpringHome() {
  const insets = useSafeAreaInsets();
  const w = worked();
  const apps: Array<[string, IconName]> = [["Lịch", "cal"], ["Ảnh", "grid"], ["Thời tiết", "sun"], ["Ghi chú", "edit"], ["Bản đồ", "pin"], ["Ví", "wallet"], ["Tin nhắn", "msg"], ["Cài đặt", "gear"]];
  const cell = (i: number, node: ReactNode, width: "25%" | "50%" = "25%") => <Rise key={i} index={i} enabled duration={500} style={{ width, alignItems: "center" }}>{node}</Rise>;
  return (
    <View style={{ ...StyleSheet.absoluteFill }}>
      <Wall />
      <View style={{ position: "absolute", top: insets.top + 12, left: 22, right: 22, rowGap: 22 }}>
        <Rise index={0} enabled duration={500}><WidgetMed /></Rise>
        <View style={{ flexDirection: "row", marginHorizontal: -9 }}>{apps.slice(0, 4).map((a, i) => cell(i + 1, <SbApp name={a[0]} icon={a[1]} />))}</View>
        <View style={{ flexDirection: "row", marginHorizontal: -9 }}>
          <Rise index={5} enabled duration={500} style={{ width: "50%", paddingHorizontal: 9 }}>
            <Pressable accessibilityLabel="Mở app Kavor" onPress={ACT.openApp} style={[styles.wdg, { height: 160, padding: 15, justifyContent: "space-between" }]}>
              <GlassFill radius={24} fill={WDG_FILL} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Logo size={16} /><T style={styles.wh}>Hôm nay</T></View>
              <View><T style={{ fontSize: 32, lineHeight: 32, fontFamily: F.light, color: "#fff" }}>{w === null ? "00:00" : gh(w)}</T><T style={styles.ws}>giờ làm / 08:00</T></View>
              <T style={styles.ws}>Phép còn {dec(lvAvail())} ngày</T>
            </Pressable>
          </Rise>
          <View style={{ width: "50%", rowGap: 22 }}>
            <View style={{ flexDirection: "row" }}>{apps.slice(4, 6).map((a, i) => cell(i + 6, <SbApp name={a[0]} icon={a[1]} />, "50%"))}</View>
            <View style={{ flexDirection: "row" }}>{apps.slice(6, 8).map((a, i) => cell(i + 8, <SbApp name={a[0]} icon={a[1]} />, "50%"))}</View>
          </View>
        </View>
      </View>
      <T style={[styles.hint, { bottom: 128 }]}>Mô phỏng màn hình chính. Chạm nút trên widget để chấm công.</T>
      <View style={styles.sbDock}>
        <GlassFill radius={32} intensity={24} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" />
        <SbApp icon="phone" /><SbApp icon="msg" /><SbApp icon="search" /><SbApp logo onPress={ACT.openApp} />
      </View>
      <Notif />
    </View>
  );
}

export function SpringLock() {
  const insets = useSafeAreaInsets();
  const now = useClock();
  const ph = phase(), prog = Math.min(1, (worked() || 0) / 480);
  return (
    <View style={{ ...StyleSheet.absoluteFill }}>
      <Wall />
      <View style={{ position: "absolute", left: 0, right: 0, top: insets.top + 24, alignItems: "center" }}>
        <T style={{ fontSize: 17, fontFamily: F.medium, color: "#fff" }}>Thứ Sáu, 16 tháng 10</T>
        <T style={{ fontSize: 92, lineHeight: 92, fontFamily: F.semibold, color: "#fff", marginTop: 2, fontVariant: ["tabular-nums"] }}>{hm(now)}</T>
        <Rise index={1} enabled duration={500} style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable accessibilityLabel="Tiến độ ca" onPress={ACT.lockTap} style={[styles.lw, { width: 74, padding: 0, borderRadius: 37, alignItems: "center", justifyContent: "center" }]}>
            <GlassFill radius={37} intensity={20} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" />
            <Svg width={62} height={62} viewBox="0 0 62 62" style={{ position: "absolute", top: 6, left: 6 }}>
              <Circle cx="31" cy="31" r="27" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={5} />
              <Circle cx="31" cy="31" r="27" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(prog * 169.6).toFixed(1)} 170`} transform="rotate(-90 31 31)" />
            </Svg>
            <Ic n="tap" s={24} w={1.8} color="#fff" />
          </Pressable>
          <Pressable onPress={ACT.lockTap} style={[styles.lw, { width: 176, justifyContent: "center", gap: 1 }]}>
            <GlassFill radius={20} intensity={20} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" />
            <T style={{ fontSize: 12, color: "#fff", opacity: 0.85 }}>Kavor</T>
            <T style={{ fontSize: 14.5, fontFamily: F.semibold, color: "#fff" }}>{ph === "in" ? (S.inRange ? "Sẵn sàng vào ca" : "Ngoài vùng 126 m") : ph === "out" ? "Trong ca từ " + hm(S.clockIn!) : "Đã xong ca"}</T>
            <T style={{ fontSize: 12, color: "#fff", opacity: 0.85 }}>{ph === "done" ? hm(S.clockIn!) + " – " + hm(S.clockOut!) : "Chạm để chấm công"}</T>
          </Pressable>
        </Rise>
      </View>
      <T style={[styles.hint, { bottom: 112 }]}>Chạm widget → Face ID → chấm công.{"\n"}Chạm biểu tượng Kavor bên dưới để về app.</T>
      <View style={{ position: "absolute", bottom: 46, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable accessibilityLabel="Đèn pin" onPress={() => toast("Đèn pin")} style={styles.lockBtn}><GlassFill radius={26} intensity={14} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" /><Ic n="sun" s={22} w={1.6} color="#fff" /></Pressable>
        <Pressable accessibilityLabel="Mở app Kavor" onPress={ACT.openApp} style={styles.lockBtn}><GlassFill radius={26} intensity={14} fill="linear-gradient(0deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22))" /><Logo size={32} /></Pressable>
      </View>
    </View>
  );
}

/* ---------- Done ---------- */
export function doneSpec(): ScreenSpec {
  const d = S.done!;
  return {
    head: <View style={{ height: 54 }} />,
    body: [
      <View key="c" style={{ alignItems: "center", gap: 10, paddingTop: 70 }}>
        <Illus kind={d.illus} />
        <Balanced style={{ fontSize: 24, fontFamily: F.bold, marginTop: 6, textAlign: "center" }}>{d.title}</Balanced>
        <T style={{ color: C.ink2, textAlign: "center", maxWidth: 290 }}>{d.text}</T>
      </View>,
      d.rows ? <Card key="rows">{d.rows.map((r) => <InfoRow key={r[0]} k={r[0]} v={r[1]} strong />)}</Card> : null,
    ],
    foot: <Foot><Btn block onPress={() => ACT.doneGo(d.primary[1])}>{d.primary[0]}</Btn><Btn kind="ghost" block onPress={() => ACT.doneGo("home")}>Về trang chủ</Btn></Foot>,
  };
}

/* ---------- Error states E01–E31 ---------- */
type ErrDef = { il: Parameters<typeof Illus>[0]["kind"]; t: string; p: string; code: string; acts: Array<[string, keyof typeof ACT, 1?]>; full?: boolean };
export const ERR: Record<ErrKind, ErrDef> = {
  offline: { il: "offline", t: "Không có kết nối mạng", p: "Kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.", code: "E01", acts: [["Thử lại", "errRetry", 1]] },
  server: { il: "server", t: "Hệ thống đang gặp sự cố", p: "Lỗi không đến từ phía bạn. Vui lòng thử lại sau ít phút.", code: "E04 · mã lỗi 503-NH-0712", acts: [["Thử lại", "errRetry", 1], ["Liên hệ HR", "errHR"]] },
  maintenance: { il: "maintenance", t: "Kavor đang bảo trì", p: "Hệ thống tạm dừng từ 22:00 đến 23:30 hôm nay để nâng cấp. Bạn có thể quay lại sau 23:30.", code: "E05", acts: [["Đã hiểu", "errClose", 1]], full: true },
  session: { il: "session", t: "Phiên đăng nhập đã hết hạn", p: "Vì bảo mật, bạn cần đăng nhập lại. Nội dung chưa gửi vẫn được giữ trên máy.", code: "E15", acts: [["Đăng nhập lại", "errLogin", 1]], full: true },
  disabled: { il: "disabled", t: "Tài khoản đang bị khóa", p: "Tài khoản HD0142 tạm thời bị khóa. Liên hệ phòng Nhân sự để được hỗ trợ.", code: "E16", acts: [["Liên hệ HR", "errHR", 1], ["Đăng xuất", "errLogin"]], full: true },
  device: { il: "deviceLock", t: "Thiết bị này chưa được đăng ký", p: "Tài khoản của bạn đang gắn với iPhone 13 (đăng ký 02/2025). Gửi yêu cầu để HR chuyển sang máy này.", code: "E18", acts: [["Gửi yêu cầu reset", "errReset", 1], ["Để sau", "errClose"]] },
  devicePending: { il: "devicePending", t: "Đang chờ HR xử lý", p: "Yêu cầu chuyển thiết bị đã gửi lúc 08:03. Bạn sẽ nhận thông báo khi được duyệt, thường trong giờ hành chính.", code: "E19", acts: [["Làm mới trạng thái", "errPending", 1], ["Về trang chủ", "errClose"]] },
  locPerm: { il: "locPerm", t: "Kavor cần quyền vị trí", p: "Bật vị trí “Khi dùng ứng dụng” và “Vị trí chính xác” để chấm công trong vùng 3 m.", code: "E20", acts: [["Mở Cài đặt", "errSettings", 1], ["Để sau", "errClose"]] },
  gpsOff: { il: "gpsOff", t: "Không lấy được vị trí", p: "Dịch vụ định vị đang tắt hoặc tín hiệu yếu. Bật định vị, ra gần cửa sổ rồi thử lại.", code: "E21", acts: [["Thử lại", "errRetry", 1], ["Gửi giải trình", "errExplain"]] },
  update: { il: "update", t: "Có phiên bản mới", p: "Bản 2.4.0 sửa lỗi chấm công khi mạng yếu. Bạn cần cập nhật để tiếp tục sử dụng.", code: "E31 · đang dùng 2.3.1", acts: [["Cập nhật", "errUpdate", 1]], full: true },
};

function ErrBody({ e, kind }: { e: ErrDef; kind?: ErrKind }) {
  const sh = useShake(S.shake.key === "err" ? S.shake.n : 0);
  return (
    <Animated.View style={[{ alignItems: "center", gap: 12, paddingTop: 36 }, sh]}>
      <Illus kind={e.il} />
      <Balanced style={{ fontSize: 22, fontFamily: F.bold, marginTop: 4, textAlign: "center" }}>{e.t}</Balanced>
      <T style={{ color: C.ink2, maxWidth: 300, textAlign: "center" }}>{e.p}</T>
      <T style={{ fontSize: 11.5, color: C.ink3, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{e.code}</T>
      {kind === "devicePending" ? <Card pad style={{ width: "100%", marginTop: 8 }}><Timeline cur={1} steps={[["Đã gửi yêu cầu", "Hôm nay 08:03"], ["HR xác nhận", "Mai Phương Thảo"], ["Đăng ký máy mới", "iPhone 15"]]} /></Card> : null}
    </Animated.View>
  );
}

export function errSpec(): ScreenSpec {
  const base = ERR[S.err?.kind ?? "offline"] ?? ERR.offline;
  const e: ErrDef = { ...base, ...(S.err?.over ?? {}) };
  const canBack = S.stack.length > 1 && !e.full;
  return {
    head: canBack ? <TopBar title="" right={null} /> : <View style={{ height: 60 }} />,
    body: [<ErrBody key="e" e={e} kind={S.err?.kind} />, <View key="sp" style={{ height: 130 }} />],
    foot: <Foot>{e.acts.map((a) => <Btn key={a[0]} kind={a[2] ? "primary" : "ghost"} block spinKey={a[1]} onPress={() => (ACT[a[1]] as () => void)()}>{a[0]}</Btn>)}</Foot>,
  };
}

export const RAW: Partial<Record<Route, () => ReactNode>> = { springHome: () => <SpringHome />, springLock: () => <SpringLock /> };

const styles = StyleSheet.create({
  pf: { ...glass, alignItems: "center", paddingTop: 10, paddingHorizontal: 10, paddingBottom: 18, borderRadius: 28 },
  cover: { width: "100%", height: 124, borderRadius: 20, overflow: "hidden" },
  wdg: { borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.6), 0px 14px 30px -16px rgba(0,30,20,0.45)" },
  wdgMed: { height: 160, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  wh: { fontSize: 11, fontFamily: F.semibold, color: "rgba(255,255,255,0.86)", letterSpacing: 1.1, textTransform: "uppercase" },
  ws: { fontSize: 12, color: "rgba(255,255,255,0.86)", fontFamily: F.medium },
  wbtn: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  sbIcon: { width: 60, height: 60, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sbName: { fontSize: 11, fontFamily: F.medium, color: "#fff", textShadowColor: "rgba(0,0,0,0.25)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  hint: { position: "absolute", left: 24, right: 24, textAlign: "center", fontSize: 12, color: "#fff", opacity: 0.85 },
  sbDock: { position: "absolute", left: 12, right: 12, bottom: 22, height: 92, borderRadius: 32, flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  notif: { position: "absolute", left: 10, right: 10, zIndex: 50, borderRadius: 24, boxShadow: "0px 18px 30px -16px rgba(0,0,0,0.4)" },
  lw: { height: 74, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12 },
  lockBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});

/* ---------- U03 Bảo mật và thiết bị ---------- */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Switch accessibilityLabel={label} value={on} onValueChange={onChange} trackColor={{ true: C.emerald, false: C.line2 }} ios_backgroundColor={C.line2} />;
}
export function securitySpec(): ScreenSpec {
  const bio = S.bioLabel;
  return {
    head: <TopBar title="Bảo mật và thiết bị" right={null} />,
    body: [
      <SectionHead key="sh1" title={bio} />,
      <Card key="bio">
        <Row><Gi n="face" s={24} /><View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold }}>Đăng nhập bằng {bio}</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>Không cần nhập mật khẩu khi mở app</T></View><Toggle label={`Đăng nhập bằng ${bio}`} on={S.bio.login} onChange={(v) => { void setBioPref("login", v); }} /></Row>
        <Row><Gi n="lock" s={24} /><View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold }}>Mở khóa lương và tạm ứng</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>Dùng {bio} thay cho mã PIN</T></View><Toggle label={`Mở khóa bằng ${bio}`} on={S.bio.unlock} onChange={(v) => { void setBioPref("unlock", v); }} /></Row>
      </Card>,
      <Note key="n" icon="info">{`Quyền dùng ${bio} của Kavor do iOS quản lý tại Cài đặt → Face ID & Mật mã → Ứng dụng khác. Nếu tắt ở đó, Kavor sẽ chỉ dùng mã PIN.`}</Note>,
      <SectionHead key="sh2" title="Thiết bị chấm công" />,
      <Card key="dev"><InfoRow k="Thiết bị" v="iPhone 15 · iOS 26" strong /><InfoRow k="Đăng ký từ" v="16/10/2026" strong /><InfoRow k="Trạng thái" v="Đang hoạt động" strong /></Card>,
      <Btn key="reset" kind="ghost" block onPress={() => toast("Đã gửi yêu cầu reset thiết bị cho HR (mô phỏng)")}>Yêu cầu reset khi đổi máy</Btn>,
    ],
  };
}
