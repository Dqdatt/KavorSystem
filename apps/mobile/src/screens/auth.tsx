import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Blur } from "../blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, EASE, F } from "../theme";
import { FaceId, Gi, Ic, Logo, type IconName } from "../icons";
import { Illus } from "../illus";
import { useReducedMotion, useShake } from "../motion";
import { Balanced, Btn, Card, ErrLine, InfoRow, T } from "../ui";
import { Foot, TopBar, type ScreenSpec } from "../screen";
import { ACT, S, back, emit, go, toast } from "../store";

/* ---------- khung chung .auth / .auth-page ---------- */
function AuthPage({ children, back: hasBack, progress, otp }: { children: ReactNode; back?: boolean; progress?: number; otp?: boolean }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => { if (!reduced) Animated.timing(v, { toValue: 1, duration: 520, easing: EASE, useNativeDriver: true }).start(); }, []);
  const top = insets.top;
  return (
    <View style={styles.auth}>
      <View pointerEvents="none" style={[styles.ring, { width: 520, height: 250, left: -260, top: 64, transform: [{ rotate: "-22deg" }] }]} />
      <View pointerEvents="none" style={[styles.ring, { width: 430, height: 210, right: -248, bottom: 82, transform: [{ rotate: "18deg" }] }]} />
      <Animated.View style={{ flex: 1, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingTop: otp ? top + 98 : top + 20, paddingHorizontal: 24, paddingBottom: 32, gap: 14 }}>
          {children}
        </ScrollView>
      </Animated.View>
      {hasBack ? (
        <Pressable accessibilityLabel="Quay lại" onPress={back} style={[styles.back, { top: top + 6 }]}>
          <Blur intensity={20} style={[StyleSheet.absoluteFill, { borderRadius: 21 }]} />
          <Ic n="chevL" s={20} w={2} color={C.ink2} />
        </Pressable>
      ) : null}
      {progress ? (
        <View pointerEvents="none" style={[styles.progress, { top: top + 54 }]}>
          {[1, 2, 3].map((i) => <View key={i} style={[styles.bar, i === progress && { backgroundColor: C.emerald }]} />)}
        </View>
      ) : null}
    </View>
  );
}

const Brand = ({ otp }: { otp?: boolean }) => (
  <View style={[styles.brand, otp && { marginTop: 40, marginBottom: 18 }]}>
    <View style={{ width: 138, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }}>
      <Logo size={46} plain />
      <T style={{ fontSize: 25, lineHeight: 25, fontFamily: F.bold, letterSpacing: -0.875, color: C.emerald }}>Kavor</T>
    </View>
  </View>
);

const Head = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={{ alignItems: "center", marginBottom: 16 }}>
    <T style={styles.h1}>{title}</T>
    <T style={styles.p}>{children}</T>
  </View>
);

function Fl({ icon, value, placeholder, onChange, secure, trailing, keyboard }: { icon: IconName; value: string; placeholder: string; onChange: (v: string) => void; secure?: boolean; trailing?: ReactNode; keyboard?: "email-address" | "default" }) {
  const [focus, setFocus] = useState(false);
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={[styles.fl, focus && styles.flFocus]}>
      <Ic n={icon} s={19} w={1.7} color="#96A19C" />
      <TextInput ref={ref} allowFontScaling={false} value={value} placeholder={placeholder} placeholderTextColor="#88938E" onChangeText={onChange} secureTextEntry={secure}
        autoCapitalize="none" autoCorrect={false} keyboardType={keyboard ?? "default"} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={styles.flInput} />
      {trailing}
    </Pressable>
  );
}
const FlBtn = ({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) => (
  <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}><Ic n={icon} s={20} color="#7C8983" /></Pressable>
);

const AuthLink = ({ children, onPress, bold, style }: { children: string; onPress: () => void; bold?: boolean; style?: object }) => (
  <T onPress={onPress} suppressHighlighting style={[{ fontSize: 12.5, fontFamily: bold ? F.bold : F.semibold, color: bold ? C.ink : C.ink2 }, style]}>{children}</T>
);

const AuthFoot = ({ q, link, onPress }: { q: string; link: string; onPress: () => void }) => (
  <View style={{ marginTop: "auto", paddingTop: 8, alignItems: "center" }}>
    <T style={{ fontSize: 12.5, color: C.ink2, textAlign: "center" }}>{q} <AuthLink bold onPress={onPress}>{link}</AuthLink></T>
  </View>
);

/* ---------- Screens ---------- */
export function Login() {
  const f = S.f;
  return (
    <AuthPage>
      <Brand />
      <Head title="Đăng nhập">Chào mừng bạn trở lại Kavor. Đăng nhập để bắt đầu ngày làm việc.</Head>
      <View style={{ gap: 12 }}>
        <Fl icon="user" value={f.lgId} placeholder="Mã nhân viên hoặc email" onChange={(v) => { f.lgId = v; emit(); }} />
        <Fl icon="lock" value={f.lgPw} placeholder="Mật khẩu" secure={!f.lgPwShow} onChange={(v) => { f.lgPw = v; emit(); }}
          trailing={<FlBtn icon={f.lgPwShow ? "eyeOff" : "eye"} label="Hiện mật khẩu" onPress={() => { f.lgPwShow = !f.lgPwShow; emit(); }} />} />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginHorizontal: 4, marginBottom: 2 }}>
          <Pressable hitSlop={8} onPress={() => go("forgot")}><T style={{ fontSize: 12.5, fontFamily: F.semibold, color: C.ink2 }}>Quên mật khẩu?</T></Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Btn kind="auth" flex spinKey="login" onPress={ACT.login}>Đăng nhập</Btn>
          <Pressable accessibilityLabel="Đăng nhập bằng Face ID" onPress={() => { void ACT.faceLogin(); }} style={({ pressed }) => [styles.face, pressed && { transform: [{ scale: 0.94 }], backgroundColor: "#EAF7F1", boxShadow: undefined }]}>
            <FaceId size={26} color={C.emerald} />
          </Pressable>
        </View>
        <View style={styles.or}><View style={styles.orLine} /><T style={{ fontSize: 12, color: C.ink3 }}>Hoặc</T><View style={styles.orLine} /></View>
        <Pressable onPress={ACT.ssoLogin} style={({ pressed }) => [styles.social, pressed && { transform: [{ scale: 0.98 }], backgroundColor: "#fff" }]}>
          <View style={styles.q}><Gi n="building" s={19} /></View>
          <T style={{ fontSize: 13.5, fontFamily: F.semibold }}>Đăng nhập SSO công ty</T>
        </Pressable>
      </View>
      <AuthFoot q="Lần đầu sử dụng?" link="Kích hoạt tài khoản" onPress={ACT.toActivate} />
    </AuthPage>
  );
}

export function Forgot() {
  const f = S.f;
  return (
    <AuthPage back progress={1}>
      <Brand />
      <Head title="Quên mật khẩu?">Nhập mã nhân viên hoặc email công ty. Kavor sẽ gửi mã xác thực để bạn tạo mật khẩu mới.</Head>
      <View style={{ gap: 12 }}>
        <Fl icon="msg" value={f.fgId} placeholder="Mã nhân viên hoặc email" keyboard="email-address" onChange={(v) => { f.fgId = v; emit(); }} />
        <View style={styles.resetNote}>
          <Ic n="shield" s={18} w={1.8} color={C.emerald} style={{ marginTop: 1 }} />
          <T style={{ flex: 1, fontSize: 12, lineHeight: 18, color: C.ink2 }}>Mã OTP có hiệu lực trong 5 phút và chỉ dùng được một lần.</T>
        </View>
        {f.fgErr ? <ErrLine center shakeKey="fgErr">Vui lòng nhập mã nhân viên hoặc email.</ErrLine> : null}
        <Btn kind="auth" block spinKey="sendResetOtp" onPress={ACT.sendResetOtp}>Gửi mã xác thực</Btn>
      </View>
      <AuthFoot q="Đã nhớ mật khẩu?" link="Đăng nhập" onPress={ACT.toLogin} />
    </AuthPage>
  );
}

function OtpBoxes({ label }: { label: string }) {
  const refs = useRef<Array<TextInput | null>>([]);
  const otp = S.f.otp;
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 18 }}>
      {otp.map((v, i) => <OtpBox key={i} value={v} inputRef={(r) => { refs.current[i] = r; }} label={`Số OTP ${i + 1}`}
        onChange={(t) => {
          /* Gõ nhanh, dán hoặc iOS tự điền mã: nhiều chữ số đến cùng lúc → rải sang các ô kế tiếp */
          const d = t.replace(/\D/g, "");
          if (!d) { otp[i] = ""; emit(); return; }
          const typedAfter = !!otp[i] && d.length > otp[i]!.length && d.startsWith(otp[i]!);
          const chars = typedAfter ? d.slice(otp[i]!.length) : d;
          let at = typedAfter ? i + 1 : i;
          for (const c of chars) { if (at > 5) break; otp[at] = c; at++; }
          emit();
          refs.current[Math.min(at, 5)]?.focus();
        }}
        onBack={() => { if (!otp[i]) refs.current[i - 1]?.focus(); }} />)}
    </View>
  );
}
function OtpBox({ value, onChange, onBack, inputRef, label }: { value: string; onChange: (t: string) => void; onBack: () => void; inputRef: (r: TextInput | null) => void; label: string }) {
  const [focus, setFocus] = useState(false);
  return <TextInput ref={inputRef} accessibilityLabel={label} allowFontScaling={false} value={value} onChangeText={onChange} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code" selectTextOnFocus
    onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace") onBack(); }} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
    style={[styles.otp, focus && { borderColor: C.emerald, backgroundColor: "#fff", boxShadow: "0px 0px 0px 4px rgba(167,243,208,0.34)" }]} />;
}

function OtpScreen({ title, label, btn, act, spinKey, progress }: { title: string; label: string; btn: string; act: () => void; spinKey: string; progress: number }) {
  return (
    <AuthPage back progress={progress} otp>
      <Brand otp />
      <Head title={title}>{title === "Nhập mã OTP" ? "Mã xác thực 6 số đã được gửi đến" : "Mã OTP 6 số đã được gửi đến"}{"\n"}<T style={{ fontSize: 13, fontFamily: F.bold, color: C.ink2 }}>{S.f.otpDest}</T></Head>
      <OtpBoxes label={label} />
      <Btn kind="auth" block spinKey={spinKey} onPress={act}>{btn}</Btn>
      <T style={{ fontSize: 12.5, color: C.ink2, textAlign: "center" }}>Chưa nhận được mã? <AuthLink bold onPress={ACT.resendOtp}>Gửi lại OTP</AuthLink></T>
    </AuthPage>
  );
}
export const ForgotOtp = () => <OtpScreen title="Xác thực tài khoản" label="Mã OTP đặt lại mật khẩu" btn="Tiếp tục" act={ACT.verifyResetOtp} spinKey="verifyResetOtp" progress={2} />;
export const Otp = () => <OtpScreen title="Nhập mã OTP" label="Mã OTP 6 số" btn="Xác nhận" act={ACT.verifyOtp} spinKey="verifyOtp" progress={2} />;

export function ResetPassword() {
  const f = S.f;
  return (
    <AuthPage back progress={3}>
      <Brand />
      <Head title="Tạo mật khẩu mới">Chọn mật khẩu khác với mật khẩu gần nhất để bảo vệ tài khoản của bạn.</Head>
      <View style={{ gap: 12 }}>
        <Fl icon="lock" value={f.newPw} placeholder="Mật khẩu mới" secure={!f.newPwShow} onChange={(v) => { f.newPw = v; emit(); }}
          trailing={<FlBtn icon={f.newPwShow ? "eyeOff" : "eye"} label={f.newPwShow ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onPress={() => { f.newPwShow = !f.newPwShow; emit(); }} />} />
        <Fl icon="lock" value={f.confirmPw} placeholder="Nhập lại mật khẩu" secure={!f.confirmPwShow} onChange={(v) => { f.confirmPw = v; emit(); }}
          trailing={<FlBtn icon={f.confirmPwShow ? "eyeOff" : "eye"} label={f.confirmPwShow ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onPress={() => { f.confirmPwShow = !f.confirmPwShow; emit(); }} />} />
        <View style={styles.rules}>
          {["Ít nhất 8 ký tự", "Có chữ và số", "Có chữ hoa", "Không chứa mã NV"].map((r) => (
            <View key={r} style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#9EDCC5", boxShadow: "0px 0px 0px 3px rgba(158,220,197,0.2)" }} />
              <T style={{ fontSize: 11.5, lineHeight: 15.5, color: C.ink2 }}>{r}</T>
            </View>
          ))}
        </View>
        {f.resetErr ? <ErrLine center shakeKey="resetErr">{f.resetErr}</ErrLine> : null}
        <Btn kind="auth" block spinKey="resetPassword" onPress={ACT.resetPassword}>Đặt lại mật khẩu</Btn>
      </View>
    </AuthPage>
  );
}

export function Activate() {
  const f = S.f;
  const sh = useShake(S.shake.key === "agreeErr" ? S.shake.n : 0);
  return (
    <AuthPage back>
      <Brand />
      <Head title="Kích hoạt tài khoản">Dùng thông tin nhân sự đã đăng ký với công ty để tạo tài khoản Kavor.</Head>
      <View style={{ gap: 12 }}>
        <Fl icon="user" value={f.acId} placeholder="Mã nhân viên" onChange={(v) => { f.acId = v; emit(); }} />
        <Fl icon="msg" value={f.acMail} placeholder="Email công ty" keyboard="email-address" onChange={(v) => { f.acMail = v; emit(); }} />
        <Fl icon="lock" value={f.acPw} placeholder="Tạo mật khẩu" secure onChange={(v) => { f.acPw = v; emit(); }}
          trailing={<FlBtn icon="info" label="Yêu cầu mật khẩu" onPress={() => toast("Tối thiểu 8 ký tự, có chữ và số")} />} />
        <Pressable onPress={() => { f.agree = !f.agree; if (f.agree) f.agreeErr = false; emit(); }} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 2, paddingHorizontal: 4 }} accessibilityRole="checkbox" accessibilityState={{ checked: f.agree }}>
          <View style={[styles.cbx, f.agree && { backgroundColor: C.emerald, borderColor: C.emerald }]}>{f.agree ? <Ic n="check" s={12} w={3} color="#fff" /> : null}</View>
          <T style={{ flex: 1, fontSize: 12, lineHeight: 17.4, color: C.ink2 }}>Tôi đồng ý để công ty xử lý <T onPress={() => toast("Dữ liệu vị trí chỉ được lấy khi bạn thực hiện chấm công.")} style={{ fontSize: 12, lineHeight: 17.4, color: C.emerald, fontFamily: F.semibold }}>dữ liệu cá nhân</T> cho mục đích nhân sự.</T>
        </Pressable>
        {f.agreeErr ? <Animated.View style={sh}><ErrLine center>Bạn cần đồng ý để tiếp tục.</ErrLine></Animated.View> : null}
        <Btn kind="auth" block spinKey="activate" onPress={ACT.activate}>Tiếp tục</Btn>
      </View>
      <AuthFoot q="Đã có tài khoản?" link="Đăng nhập" onPress={ACT.toLogin} />
    </AuthPage>
  );
}

export function deviceSpec(): ScreenSpec {
  return {
    head: <TopBar title="Thiết bị chấm công" right={null} />,
    body: [
      <View key="c" style={{ alignItems: "center", gap: 10, paddingTop: 10 }}>
        <Illus kind="device" />
        <Balanced style={styles.h2}>Đăng ký điện thoại này để chấm công</Balanced>
        <T style={{ color: C.ink2, textAlign: "center", maxWidth: 290 }}>Mỗi nhân viên chấm công trên một điện thoại. Khi đổi máy, bạn gửi yêu cầu để HR reset.</T>
      </View>,
      <Card key="card"><InfoRow k="Thiết bị" v="iPhone 15 · iOS 26" strong /><InfoRow k="Tên máy" v="iPhone của Hà" strong /><InfoRow k="Mã thiết bị" v="8F2A…C41" strong /></Card>,
      <View key="sp" style={{ height: 70 }} />,
    ],
    foot: <Foot><Btn block onPress={ACT.registerDevice}>Đăng ký thiết bị này</Btn></Foot>,
  };
}

const styles = StyleSheet.create({
  auth: { ...StyleSheet.absoluteFill, overflow: "hidden", experimental_backgroundImage: "radial-gradient(circle at 106% -2%, rgba(111,216,179,0.25) 0%, rgba(111,216,179,0) 31%), radial-gradient(circle at -12% 103%, rgba(255,224,169,0.28) 0%, rgba(255,224,169,0) 30%), linear-gradient(145deg, #FBFBFD 0%, #F7FAF9 48%, #F9FBFA 100%)" },
  ring: { position: "absolute", borderWidth: 1, borderColor: "rgba(6,95,70,0.07)", borderRadius: 999 },
  back: { position: "absolute", left: 18, zIndex: 4, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(19,36,30,0.1)", boxShadow: "0px 8px 20px -13px rgba(6,70,50,0.4)", overflow: "hidden" },
  progress: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 10, zIndex: 3 },
  bar: { width: 34, height: 4, borderRadius: 3, backgroundColor: "#D8DDDA" },
  brand: { width: 164, height: 82, borderRadius: 30, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 10, marginBottom: 20, experimental_backgroundImage: "linear-gradient(145deg, #E6F6EF, #D4F1E4)", boxShadow: "0px 16px 34px -24px rgba(6,95,70,0.55)" },
  h1: { fontSize: 31, lineHeight: 35.6, fontFamily: F.bold, letterSpacing: -1.08, color: "#123024", marginBottom: 12, textAlign: "center" },
  p: { fontSize: 13, lineHeight: 20.2, color: C.ink2, textAlign: "center", maxWidth: 300 },
  h2: { fontSize: 24, fontFamily: F.bold, marginTop: 6, textAlign: "center" },
  fl: { minHeight: 64, borderRadius: 32, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "rgba(19,36,30,0.07)", boxShadow: "0px 12px 28px -24px rgba(6,70,50,0.45)" },
  flFocus: { borderColor: "rgba(6,95,70,0.42)", backgroundColor: "#fff", boxShadow: "0px 0px 0px 4px rgba(167,243,208,0.34)" },
  flInput: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: F.medium, color: C.ink, padding: 0, height: 62 },
  face: { width: 60, height: 60, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(6,95,70,0.2)", boxShadow: "0px 14px 28px -20px rgba(6,95,70,0.8)" },
  or: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: C.line2 },
  social: { height: 56, borderRadius: 28, borderWidth: 1, borderColor: "#C9D0CC", backgroundColor: "rgba(255,255,255,0.52)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  q: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F6EF" },
  resetNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(231,247,239,0.78)", borderWidth: 1, borderColor: "rgba(6,95,70,0.08)" },
  otp: { flex: 1, height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: "#CBD2CE", backgroundColor: "rgba(255,255,255,0.62)", textAlign: "center", fontSize: 20, fontFamily: F.semibold, color: C.ink, padding: 0 },
  rules: { flexDirection: "row", flexWrap: "wrap", rowGap: 7, columnGap: 10, paddingTop: 2, paddingHorizontal: 8, paddingBottom: 4 },
  cbx: { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderColor: "#767676", marginTop: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
