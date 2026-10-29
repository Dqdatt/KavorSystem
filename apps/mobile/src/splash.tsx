import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { SvgXml } from "react-native-svg";
import { EASE, F } from "./theme";
import { useReducedMotion } from "./motion";
import { T } from "./ui";

/* Giữ splash gốc (iOS: ảnh gradient xanh + logo trắng 112pt; Android: nền #065F46) cho đến khi app sẵn sàng */
SplashScreen.preventAutoHideAsync().catch(() => {});

/* Chế độ QA bỏ qua lớp chuyển cảnh: chỉ cần ẩn splash gốc */
export function NativeSplashGone() {
  useEffect(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  return null;
}

const LOGO_W = 112;
const LOGO_H = Math.round((LOGO_W * 786) / 878);
const LOGO = '<svg viewBox="16 16 439 393"><path d="M35 189 L35 389 L141 190 L245 390 L436 35" fill="none" stroke="#FFFFFF" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><circle cx="364" cy="374" r="32" fill="#FFFFFF"/></svg>';

/* Lớp phủ trùng khớp splash gốc: gradient emerald hiện dần, chữ Kavor trồi lên,
   sau đó logo phóng nhẹ và cả lớp mờ đi để lộ màn đăng nhập. */
export function SplashOverlay({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  /* Splash gốc iOS đã là ảnh gradient (ios/Kavor/Images.xcassets/SplashScreenGradient = assets/splash-gradient.png) nên lớp phủ bắt đầu ngay ở
     khung gradient — không còn khung xanh đặc (phản hồi người dùng 29/10). Android chỉ có màu đặc + icon nên gradient vẫn hiện dần. */
  const glow = useRef(new Animated.Value(Platform.OS === "ios" ? 1 : 0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(0)).current;
  const [laid, setLaid] = useState(false);

  useEffect(() => {
    if (!ready || !laid) return;
    SplashScreen.hideAsync().catch(() => {});
    if (reduced) {
      Animated.timing(out, { toValue: 1, duration: 200, useNativeDriver: true }).start(onDone);
      return;
    }
    Animated.sequence([
      Animated.parallel([
        Animated.timing(glow, { toValue: 1, duration: 520, easing: EASE, useNativeDriver: true }),
        Animated.timing(word, { toValue: 1, duration: 520, delay: 120, easing: EASE, useNativeDriver: true }),
      ]),
      Animated.delay(260),
      Animated.timing(out, { toValue: 1, duration: 480, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
    ]).start(onDone);
  }, [ready, laid, reduced]);

  return (
    <Animated.View pointerEvents="none" onLayout={() => setLaid(true)}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: out.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1, 0] }) }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.gradient, { opacity: glow }]} />
      <Animated.View style={{ alignItems: "center", transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }}>
        <View style={{ width: LOGO_W, height: LOGO_H }}><SvgXml xml={LOGO} width={LOGO_W} height={LOGO_H} /></View>
      </Animated.View>
      {ready ? <Animated.View style={[styles.word, { opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
        <T style={styles.wordText}>KAVOR</T>
        <T style={styles.tag}>Nhân sự trong tầm tay</T>
      </Animated.View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 200, backgroundColor: "#065F46", alignItems: "center", justifyContent: "center" },
  gradient: { experimental_backgroundImage: "radial-gradient(circle at 22% 16%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 60%), linear-gradient(155deg, #12976F 0%, #065F46 62%, #044E39 100%)" },
  word: { position: "absolute", left: 0, right: 0, bottom: 72, alignItems: "center", gap: 4 },
  wordText: { width: "100%", textAlign: "center", paddingLeft: 4.5, color: "#FFFFFF", fontSize: 15, fontFamily: F.semibold, letterSpacing: 4.5 },
  tag: { width: "100%", textAlign: "center", color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: F.medium },
});
