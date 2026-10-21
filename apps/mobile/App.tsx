import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { SAMPLE_TENANT } from "@kavor/contracts";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type TabId = "home" | "attendance" | "requests" | "news";
type FlowId = "leave" | "leaveNew" | "explain" | "ot" | "advance" | "advanceNew" | "payslips" | "profile" | "profileEdit" | "device" | "clock" | "approvalDetail" | "notifications" | "widget" | "newsDetail" | "requestDetail" | "done" | "login" | "activate" | "forgot" | "otp" | "resetPassword";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type RequestKind = "leave" | "ot" | "explain" | "advance";

type RequestItem = {
  id: string;
  kind: RequestKind;
  title: string;
  detail: string;
  status: RequestStatus;
  created: string;
  reason: string;
};

const initialRequests: RequestItem[] = [
  { id: "NP-2310", kind: "leave", title: "Nghỉ phép năm", detail: "23/10/2026 · 1 ngày", status: "pending", created: "16/10 · 09:12", reason: "Việc gia đình" },
  { id: "OT-1810", kind: "ot", title: "Làm thêm giờ", detail: "18/10/2026 · 2 giờ", status: "approved", created: "14/10 · 15:40", reason: "Hoàn thành kế hoạch tháng" },
  { id: "GT-1510", kind: "explain", title: "Giải trình công", detail: "15/10/2026 · thiếu giờ vào", status: "pending", created: "16/10 · 08:30", reason: "Điện thoại hết pin khi đến công ty" },
  { id: "TU-0912", kind: "advance", title: "Tạm ứng lương", detail: "3.000.000 ₫ · kỳ 09/2026", status: "approved", created: "12/09 · 09:20", reason: "Chi phí y tế" },
];

const initialApprovals: RequestItem[] = [
  { id: "NP-2410", kind: "leave", title: "Võ Thảo Linh", detail: "Nghỉ phép · 24/10 · 1 ngày", status: "pending", created: "16/10 · 07:42", reason: "Việc gia đình" },
  { id: "GT-1610", kind: "explain", title: "Đặng Văn Khoa", detail: "Giải trình · thiếu giờ vào", status: "pending", created: "16/10 · 06:58", reason: "Đi công tác tại xưởng" },
];

const requestIcon: Record<RequestKind, IconName> = { leave: "airplane", ot: "weather-night", explain: "clock-edit-outline", advance: "cash-multiple" };
const requestStatusLabel: Record<RequestStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã hủy" };

const tabs: Array<{ id: TabId; label: string; icon: IconName; activeIcon: IconName }> = [
  { id: "home", label: "Trang chủ", icon: "home-outline", activeIcon: "home-variant" },
  { id: "attendance", label: "Bảng công", icon: "calendar-blank-outline", activeIcon: "calendar-check" },
  { id: "requests", label: "Đơn từ", icon: "file-document-outline", activeIcon: "file-document" },
  { id: "news", label: "Bản tin", icon: "newspaper-variant-outline", activeIcon: "newspaper-variant" },
];

const shortcuts: Array<{ label: string; icon: IconName }> = [
  { label: "Xin nghỉ", icon: "airplane" },
  { label: "Giải trình", icon: "clock-outline" },
  { label: "Làm thêm", icon: "weather-night" },
  { label: "Tạm ứng", icon: "cash-multiple" },
  { label: "Phiếu lương", icon: "receipt-text-outline" },
  { label: "Hồ sơ", icon: "account-outline" },
  { label: "Widget", icon: "view-grid-outline" },
  { label: "Thông báo", icon: "bell-outline" },
];

const quickCreate: Array<{ label: string; detail: string; icon: IconName; flow: FlowId }> = [
  { label: "Chấm công", detail: "Giữ để vào hoặc ra ca", icon: "gesture-tap-hold", flow: "clock" },
  { label: "Xin nghỉ phép", detail: "Còn 6,5 ngày phép", icon: "airplane", flow: "leaveNew" },
  { label: "Giải trình công", detail: "Còn 2/3 lượt · hạn 22/10", icon: "clock-edit-outline", flow: "explain" },
  { label: "Làm thêm giờ", detail: "Đăng ký OT", icon: "weather-night", flow: "ot" },
  { label: "Tạm ứng lương", detail: "Hạn mức 4,5 triệu", icon: "cash-multiple", flow: "advance" },
  { label: "Phiếu lương", detail: "Tháng 09/2026", icon: "receipt-text-outline", flow: "payslips" },
  { label: "Sửa hồ sơ", detail: "Gửi HR phê duyệt", icon: "account-edit-outline", flow: "profileEdit" },
];

function AppIcon({ name, size = 22, color = "#065F46" }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function KavorMark({ size = 58 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 470 425" accessibilityLabel="Kavor">
    <Defs><SvgLinearGradient id="kavorGreen" x1="35" y1="390" x2="436" y2="35" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#10A37F" /><Stop offset="1" stopColor="#065F46" /></SvgLinearGradient></Defs>
    <Path d="M35 189 L35 389 L141 190 L245 390 L436 35" fill="none" stroke="url(#kavorGreen)" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="364" cy="374" r="32" fill="#A7F3D0" />
  </Svg>;
}

function FaceIdIcon({ size = 28, color = "#065F46" }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Face ID">
    <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

function GlassLayer({ intensity = 68 }: { intensity?: number }) {
  return <BlurView pointerEvents="none" intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

function MotionScreen({ children, variant = "push" }: { children: ReactNode; variant?: "push" | "fade" }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, speed: 17, bounciness: 1, useNativeDriver: true }).start();
  }, [enter, reduced, variant]);
  const translate = variant === "push"
    ? { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [Math.min(width * 0.22, 84), 0] }) }
    : { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) };
  return <Animated.View style={[styles.scene, { opacity: enter, transform: [translate] }]}>{children}</Animated.View>;
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { value.setValue(1); return; }
    value.setValue(0);
    Animated.spring(value, { toValue: 1, delay, speed: 15, bounciness: 2, useNativeDriver: true }).start();
  }, [delay, reduced, value]);
  return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{children}</Animated.View>;
}

function DecorativeBackground() {
  const reduced = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift, reduced]);
  const move = { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }, { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.blob, styles.blobTop, move]}><LinearGradient colors={["rgba(167,243,208,0.72)", "rgba(167,243,208,0)"]} style={StyleSheet.absoluteFill} /></Animated.View>
      <Animated.View style={[styles.blob, styles.blobRight, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }, { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }]}><LinearGradient colors={["rgba(16,185,129,0.22)", "rgba(16,185,129,0)"]} style={StyleSheet.absoluteFill} /></Animated.View>
      <Animated.View style={[styles.blob, styles.blobBottom, move]}><LinearGradient colors={["rgba(110,231,183,0.38)", "rgba(110,231,183,0)"]} style={StyleSheet.absoluteFill} /></Animated.View>
    </View>
  );
}

function HomeHeader({ onNotice, onProfile, glass = false }: { onNotice: () => void; onProfile?: () => void; glass?: boolean }) {
  return (
    <View style={[styles.header, glass && styles.headerGlass]}>
      {glass ? <GlassLayer intensity={72} /> : null}
      <Pressable accessibilityLabel="Thông báo" style={styles.circleButton} onPress={onNotice}>
        <GlassLayer intensity={55} />
        <AppIcon name="bell-outline" size={20} color="#173B31" />
        <View style={styles.notificationDot} />
      </Pressable>
      <Text style={styles.companyName}>{SAMPLE_TENANT.name.toLocaleUpperCase("vi")}</Text>
      <Pressable accessibilityLabel="Hồ sơ của tôi" style={styles.avatar} onPress={onProfile}>
        <Text style={styles.avatarText}>TH</Text>
      </Pressable>
    </View>
  );
}

const homeNews = [
  { tag: "Quan trọng", date: "Hôm qua", title: "Chấm công GPS trên app Kavor áp dụng từ 01/11/2026", icon: "message-text-outline" as IconName, tone: "alert" as const },
  { tag: "Chính sách", date: "15/10", title: "Lịch nghỉ và trực hỗ trợ cuối tháng 10", icon: "calendar-star" as IconName, tone: "normal" as const },
  { tag: "Sự kiện", date: "10/10", title: "Chúc mừng sinh nhật nhân viên tháng 10", icon: "cake-variant-outline" as IconName, tone: "normal" as const },
];

function NewsCarousel({ onOpen, onAll }: { onOpen: () => void; onAll: () => void }) {
  const { width } = useWindowDimensions();
  const cardWidth = 300;
  const cardGap = 10;
  const snapWidth = cardWidth + cardGap;
  const sidePadding = Math.max(20, (width - cardWidth) / 2);
  const [active, setActive] = useState(0);
  const carousel = useRef<ScrollView>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      setActive((current) => {
        const next = (current + 1) % homeNews.length;
        carousel.current?.scrollTo({ x: next * snapWidth, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [reduced, snapWidth]);
  return (
    <View style={styles.newsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bản tin mới</Text>
        <Pressable hitSlop={10} onPress={onAll}><Text style={styles.sectionLink}>Tất cả</Text></Pressable>
      </View>
      <ScrollView
        ref={carousel}
        horizontal
        snapToInterval={snapWidth}
        snapToAlignment="start"
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        style={styles.carouselTrack}
        contentContainerStyle={{ paddingHorizontal: sidePadding, gap: cardGap }}
        onMomentumScrollEnd={(event) => setActive(Math.round(event.nativeEvent.contentOffset.x / snapWidth))}
      >
        {homeNews.map((item, index) => (
          <View key={item.title} style={{ width: cardWidth }}>
            <Pressable style={[styles.newsCard, index !== active && styles.newsCardInactive, item.tone === "normal" && styles.newsCardNormal]} onPress={onOpen}>
              <View style={[styles.newsIcon, item.tone === "normal" && styles.newsIconNormal]}><AppIcon name={item.icon} size={23} color={item.tone === "alert" ? "#C84750" : "#087355"} /></View>
              <View style={styles.newsCopy}>
                <View style={styles.newsMeta}>
                  <View style={[styles.importantTag, item.tone === "normal" && styles.normalTag]}>{item.tone === "alert" ? <AppIcon name="alert-outline" size={11} color="#FFFFFF" /> : null}<Text style={styles.importantText}>{item.tag}</Text></View>
                  <Text style={styles.newsDate}>{item.date}</Text>
                </View>
                <Text style={styles.newsTitle}>{item.title}</Text>
              </View>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <View style={styles.carouselDots}>{homeNews.map((item, index) => <View key={item.title} style={index === active ? styles.carouselDotActive : styles.carouselDot} />)}</View>
    </View>
  );
}

function PunchHero({ checkedIn, onPunch, onTap, onDetails }: { checkedIn: boolean; onPunch: () => void; onTap: () => void; onDetails?: () => void }) {
  const reduced = useReducedMotion();
  const hold = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const didLongPress = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breathe, reduced]);

  function beginHold() {
    didLongPress.current = false;
    if (reduced) return;
    hold.setValue(0);
    Animated.timing(hold, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }

  function endHold() {
    Animated.spring(hold, { toValue: 0, speed: 22, bounciness: 5, useNativeDriver: true }).start();
  }

  function completePunch() {
    didLongPress.current = true;
    Vibration.vibrate(35);
    onPunch();
    if (!reduced) {
      Animated.sequence([
        Animated.spring(success, { toValue: 1.08, speed: 24, bounciness: 8, useNativeDriver: true }),
        Animated.spring(success, { toValue: 1, speed: 18, bounciness: 6, useNativeDriver: true }),
      ]).start();
    }
  }

  return (
    <View style={styles.hero}>
      <Text style={styles.heroTime}>07:58</Text>
      <Text style={styles.heroDate}>Thứ Sáu, 16 tháng 10</Text>
      <View style={styles.shiftChip}><AppIcon name="clock-outline" size={14} color="#65736D" /><Text style={styles.shiftText}>Ca hành chính · 08:00 – 17:00</Text></View>

      <View style={styles.punchStage}>
        <View style={[styles.mapSquare, { left: 25, top: 60 }]} />
        <View style={[styles.mapSquare, { right: 30, top: 35 }]} />
        <View style={[styles.mapSquare, { left: 65, bottom: 28 }]} />
        <View style={[styles.mapSquare, { right: 70, bottom: 18 }]} />
        <View style={styles.crossLineA} />
        <View style={styles.crossLineB} />
        <Animated.View style={[styles.haloOuter, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.62] }), transform: [{ scale: Animated.multiply(breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.05] }), hold.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })) }] }]} />
        <Animated.View style={[styles.haloInner, { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.025] }) }] }]} />
        <Animated.View style={[styles.holdRing, { opacity: hold, transform: [{ rotate: hold.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "270deg"] }) }, { scale: hold.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]} />
        <Animated.View style={[styles.punchPressable, { transform: [{ scale: Animated.multiply(success, hold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] })) }] }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={checkedIn ? "Ra ca" : "Vào ca"}
            delayLongPress={850}
            onPressIn={beginHold}
            onPressOut={endHold}
            onPress={() => { if (!didLongPress.current) onTap(); didLongPress.current = false; }}
            onLongPress={completePunch}
            style={styles.punchPressable}
          >
            <LinearGradient colors={checkedIn ? ["#D6FBEA", "#A7F3D0", "#84E5BA"] : ["#199B74", "#065F46", "#044E39"]} style={styles.punchOrb}>
              <AppIcon name={checkedIn ? "check-bold" : "gesture-tap-hold"} size={checkedIn ? 47 : 53} color={checkedIn ? "#065F46" : "#FFFFFF"} />
              <Text style={[styles.punchTitle, checkedIn && styles.punchTitleOut]}>{checkedIn ? "ĐÃ VÀO CA" : "VÀO CA"}</Text>
              <Text style={[styles.punchHint, checkedIn && styles.punchTitleOut]}>{checkedIn ? "Nhấn giữ để ra ca" : "Nhấn giữ 1 giây"}</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      <Pressable style={styles.locationRow} onPress={onDetails}><AppIcon name="map-marker-outline" size={19} color="#1D3B32" /><Text style={styles.locationText}>Vị trí: Văn phòng Quận 1</Text>{onDetails ? <AppIcon name="chevron-right" size={17} color="#7A8781" /> : null}</Pressable>
      <View style={styles.heroStats}>
        <View style={styles.heroStat}><AppIcon name="clock-in" size={29} color="#168563" /><Text style={styles.heroStatValue}>{checkedIn ? "07:58" : "--:--"}</Text><Text style={styles.heroStatLabel}>Vào ca</Text></View>
        <View style={styles.heroStat}><AppIcon name="clock-out" size={29} color="#168563" /><Text style={styles.heroStatValue}>--:--</Text><Text style={styles.heroStatLabel}>Ra ca</Text></View>
        <View style={styles.heroStat}><AppIcon name="check-circle-outline" size={29} color="#168563" /><Text style={styles.heroStatValue}>--:--</Text><Text style={styles.heroStatLabel}>Giờ làm</Text></View>
      </View>
    </View>
  );
}

function PersonalSection({ notify, openFlow }: { notify: (message: string) => void; openFlow: (flow: FlowId) => void }) {
  const shortcutAction: Record<string, () => void> = {
    "Xin nghỉ": () => openFlow("leave"),
    "Giải trình": () => openFlow("explain"),
    "Làm thêm": () => openFlow("ot"),
    "Tạm ứng": () => openFlow("advance"),
    "Phiếu lương": () => openFlow("payslips"),
    "Hồ sơ": () => openFlow("profile"),
    "Widget": () => openFlow("widget"),
    "Thông báo": () => openFlow("notifications"),
  };
  return (
    <>
      <Pressable style={styles.noticeCard} onPress={() => openFlow("explain") }>
        <View style={styles.noticeIcon}><AppIcon name="clock-alert-outline" size={25} color="#B67212" /></View>
        <View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Hạn giải trình công: 22/10</Text><Text style={styles.noticeDetail}>Ngày 15/10 thiếu giờ vào · còn 6 ngày</Text></View>
        <Text style={styles.noticeLimit}>2/3 lượt</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, styles.personalTitle]}>Của bạn</Text>
      <View style={styles.listCard}>
        <PersonalRow icon="airplane" title="Phép năm còn lại" value="6,5 ngày" onPress={() => openFlow("leave")} />
        <PersonalRow icon="cash-multiple" title="Hạn mức tạm ứng" value="4.500.000 ₫" border onPress={() => openFlow("advance")} />
        <PersonalRow icon="receipt-text-outline" title="Phiếu lương 09/2026" value="Đã công bố" border onPress={() => openFlow("payslips")} />
      </View>

      <View style={styles.shortcutsCard}>
        {shortcuts.map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcut} onPress={shortcutAction[shortcut.label] ?? (() => notify(`${shortcut.label} sẽ được triển khai ở vòng tiếp theo`))}>
            <AppIcon name={shortcut.icon} size={27} color="#087355" />
            <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function PersonalRow({ icon, title, value, border = false, onPress }: { icon: IconName; title: string; value: string; border?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} style={({ pressed }) => [styles.personalRow, border && styles.personalRowBorder, pressed && styles.rowPressed]} onPress={onPress}>
      <AppIcon name={icon} size={23} color="#087355" />
      <Text style={styles.personalLabel}>{title}</Text>
      <Text style={styles.personalValue}>{value}</Text>
      <AppIcon name="chevron-right" size={18} color="#9AA69F" />
    </Pressable>
  );
}

function HomeScreen({ checkedIn, notify, onPunch, openFlow, onNews, onPrimaryScroll, headerGlass }: { checkedIn: boolean; notify: (message: string) => void; onPunch: () => void; openFlow: (flow: FlowId) => void; onNews: () => void; onPrimaryScroll: (y: number, nearEnd: boolean) => void; headerGlass: boolean }) {
  return (
    <>
      <HomeHeader glass={headerGlass} onNotice={() => openFlow("notifications")} onProfile={() => openFlow("profile")} />
      <ScrollView contentContainerStyle={styles.homeContent} scrollIndicatorInsets={{ bottom: 112 }} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={({ nativeEvent }) => onPrimaryScroll(nativeEvent.contentOffset.y, nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 8)}>
        <Reveal delay={30}><NewsCarousel onOpen={() => openFlow("newsDetail")} onAll={onNews} /></Reveal>
        <Reveal delay={110}><PunchHero checkedIn={checkedIn} onPunch={onPunch} onTap={() => notify("Nhấn giữ nút tròn trong 1 giây để chấm công")} onDetails={() => openFlow("clock")} /></Reveal>
        <Reveal delay={190}><PersonalSection notify={notify} openFlow={openFlow} /></Reveal>
      </ScrollView>
    </>
  );
}

const attendanceRows: Array<[string, string, string, string, string, string]> = [
  ["16", "Thứ Sáu", "--:--", "17:06", "--:--", "Thiếu giờ vào"],
  ["15", "Thứ Năm", "08:07", "17:12", "08:05", "Muộn 7 phút"],
  ["14", "Thứ Tư", "07:56", "17:04", "08:08", "Đủ công"],
  ["13", "Thứ Ba", "07:59", "17:11", "08:12", "Đủ công"],
  ["12", "Thứ Hai", "07:51", "17:08", "08:17", "Đủ công"],
  ["09", "Thứ Sáu", "07:58", "17:06", "08:08", "Đủ công"],
  ["08", "Thứ Năm", "08:00", "--:--", "--:--", "Thiếu giờ ra"],
  ["07", "Thứ Tư", "07:53", "17:02", "08:09", "Đủ công"],
  ["06", "Thứ Ba", "08:04", "17:10", "08:06", "Muộn 4 phút"],
  ["05", "Thứ Hai", "07:55", "17:00", "08:05", "Đủ công"],
];

function RequestScopeSegment({ value, count, onChange }: { value: "mine" | "approve"; count: number; onChange: (value: "mine" | "approve") => void }) {
  const reduced = useReducedMotion();
  const position = useRef(new Animated.Value(value === "mine" ? 0 : 1)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    if (reduced) { position.setValue(value === "mine" ? 0 : 1); return; }
    Animated.spring(position, { toValue: value === "mine" ? 0 : 1, speed: 18, bounciness: 3, useNativeDriver: true }).start();
  }, [position, reduced, value]);
  return <View style={styles.segment} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
    <GlassLayer intensity={58} />
    <Animated.View style={[styles.segmentKnob, { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, (trackWidth - 8) / 2)] }) }] }]} />
    <Pressable style={styles.segmentButton} onPress={() => onChange("mine")}><Text style={value === "mine" ? styles.segmentActiveText : styles.segmentText}>Đơn của tôi</Text></Pressable>
    <Pressable style={styles.segmentButton} onPress={() => onChange("approve")}><Text style={value === "approve" ? styles.segmentActiveText : styles.segmentText}>Cần tôi duyệt · {count}</Text></Pressable>
  </View>;
}

function SecondaryScreen({
  tab,
  notify,
  requests,
  onOpenRequest,
  onOpenExplain,
  onOpenNews,
  approvals,
  onOpenApproval,
  onDecision,
  onPrimaryScroll,
  headerGlass,
}: {
  tab: Exclude<TabId, "home">;
  notify: (message: string) => void;
  requests: RequestItem[];
  onOpenRequest: (id: string) => void;
  onOpenExplain: () => void;
  onOpenNews: () => void;
  approvals: RequestItem[];
  onOpenApproval: (id: string) => void;
  onDecision: (id: string, approved: boolean) => void;
  onPrimaryScroll: (y: number, nearEnd: boolean) => void;
  headerGlass: boolean;
}) {
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "late" | "missing">("all");
  const [requestFilter, setRequestFilter] = useState<"all" | RequestStatus>("all");
  const [requestScope, setRequestScope] = useState<"mine" | "approve">("mine");
  const [newsFilter, setNewsFilter] = useState<"all" | "notice" | "policy" | "event">("all");
  const visibleAttendance = attendanceRows.filter((row) => attendanceFilter === "all" || (attendanceFilter === "late" ? row[5].includes("Muộn") : row[5].includes("Thiếu")));
  const visibleRequests = requests.filter((item) => requestFilter === "all" || item.status === requestFilter);
  return (
    <>
      <HomeHeader glass={headerGlass} onNotice={() => notify("Mở Thông báo từ Trang chủ")} />
      <ScrollView contentContainerStyle={styles.secondaryContent} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={({ nativeEvent }) => onPrimaryScroll(nativeEvent.contentOffset.y, nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 8)}>
        {tab === "attendance" ? (
          <>
            <View style={styles.monthCard}><Pressable><AppIcon name="chevron-left" color="#97A39D" /></Pressable><Text style={styles.monthText}>Tháng 10, 2026</Text><Pressable><AppIcon name="chevron-right" color="#97A39D" /></Pressable></View>
            <View style={styles.summaryLine}>
              <Pressable style={[styles.summaryItem, attendanceFilter === "all" && styles.summarySelected]} onPress={() => setAttendanceFilter("all")}><Summary value="10/22" label="Ngày công" /></Pressable>
              <Pressable style={[styles.summaryItem, attendanceFilter === "late" && styles.summarySelected]} onPress={() => setAttendanceFilter("late")}><Summary value="2" label="Đi muộn" /></Pressable>
              <Pressable style={[styles.summaryItem, attendanceFilter === "missing" && styles.summarySelected]} onPress={() => setAttendanceFilter("missing")}><Summary value="1" label="Thiếu công" /></Pressable>
            </View>
            {attendanceFilter !== "all" ? <View style={styles.explainCard}><View style={styles.explainCopy}><Text style={styles.explainTitle}>Còn 2/3 lượt giải trình</Text><Text style={styles.explainSub}>Hạn 22/10, trước ngày chốt công</Text></View><Pressable style={styles.smallPrimary} onPress={onOpenExplain}><Text style={styles.smallPrimaryText}>Tạo giải trình</Text></Pressable></View> : null}
            <View style={styles.attendanceCard}><View style={styles.attendanceHeader}><Text style={styles.attendanceHeaderDay}>Ngày</Text><Text style={styles.attendanceHeaderCell}>Giờ vào</Text><Text style={styles.attendanceHeaderCell}>Giờ ra</Text><Text style={[styles.attendanceHeaderCell, styles.attendanceHeaderHours]}>Giờ làm</Text></View>{visibleAttendance.map((row) => <Pressable style={styles.attendanceRow} key={row[0]} onPress={row[5] === "Đủ công" ? () => notify("Ngày công này không có bất thường") : onOpenExplain}><View style={styles.attendanceMain}><View style={styles.dayBox}><Text style={styles.dayNumber}>{row[0]}</Text><Text style={styles.dayName}>{row[1]}</Text></View><View style={styles.attendanceTimes}><Text style={[styles.rowTime, row[2] === "--:--" && styles.rowTimeMissing]}>{row[2]}</Text><Text style={[styles.rowTime, row[3] === "--:--" && styles.rowTimeMissing]}>{row[3]}</Text><View style={styles.attendanceHoursWrap}><Text style={[styles.rowTime, row[4] === "--:--" ? styles.rowTimeMissing : styles.rowTimeOk]}>{row[4]}</Text><AppIcon name="chevron-right" size={15} color="#9AA69F" /></View></View></View><Text style={row[5] === "Đủ công" ? styles.attendanceNoteOk : styles.attendanceNoteWarn}>{row[5]}</Text></Pressable>)}</View>
          </>
        ) : tab === "requests" ? (
          <>
            <RequestScopeSegment value={requestScope} count={approvals.length} onChange={setRequestScope} />
            {requestScope === "mine" ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{([['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['cancelled', 'Đã hủy']] as const).map(([id, label]) => <Pressable key={id} style={[styles.filterChip, requestFilter === id && styles.filterChipActive]} onPress={() => setRequestFilter(id)}><Text style={[styles.filterChipText, requestFilter === id && styles.filterChipTextActive]}>{label}</Text></Pressable>)}</ScrollView>{visibleRequests.length ? <View style={styles.listCard}>{visibleRequests.map((item, index) => <RequestRow key={item.id} icon={requestIcon[item.kind]} title={item.title} detail={item.detail} status={requestStatusLabel[item.status]} border={index > 0} onPress={() => onOpenRequest(item.id)} />)}</View> : <View style={styles.emptyCard}><AppIcon name="file-document-check-outline" size={42} color="#8AA097" /><Text style={styles.emptyTitle}>Không có đơn nào</Text><Text style={styles.emptyText}>Đổi bộ lọc hoặc bấm nút + để tạo đơn mới.</Text></View>}</> : approvals.length ? <View style={styles.approvalList}>{approvals.map((item) => <View key={item.id} style={styles.approvalCard}><Pressable style={styles.approvalHeader} onPress={() => onOpenApproval(item.id)}><View style={styles.approvalAvatar}><Text style={styles.approvalAvatarText}>{item.title.split(" ").map((part) => part[0]).slice(-2).join("")}</Text></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>{item.title}</Text><Text style={styles.requestDetail}>{item.detail}</Text></View><Text style={styles.rowStatusWarn}>Chờ bạn</Text><AppIcon name="chevron-right" size={17} color="#9AA69F" /></Pressable><Text style={styles.approvalReason}>{item.reason}</Text><View style={styles.approvalActions}><Pressable style={styles.rejectSmall} onPress={() => onDecision(item.id, false)}><Text style={styles.rejectSmallText}>Từ chối</Text></Pressable><Pressable style={styles.approveSmall} onPress={() => onDecision(item.id, true)}><Text style={styles.approveSmallText}>Duyệt</Text></Pressable></View></View>)}</View> : <View style={styles.emptyCard}><AppIcon name="check-all" size={42} color="#168563" /><Text style={styles.emptyTitle}>Không còn đơn cần duyệt</Text><Text style={styles.emptyText}>Đơn mới từ nhóm sẽ xuất hiện tại đây.</Text></View>}
          </>
        ) : (
          <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{([['all', 'Tất cả'], ['notice', 'Thông báo'], ['policy', 'Chính sách'], ['event', 'Sự kiện']] as const).map(([id, label]) => <Pressable key={id} style={[styles.filterChip, newsFilter === id && styles.filterChipActive]} onPress={() => setNewsFilter(id)}><Text style={[styles.filterChipText, newsFilter === id && styles.filterChipTextActive]}>{label}</Text></Pressable>)}</ScrollView><View style={styles.newsList}>{[
            { cat: "notice", important: true, title: "Bảo trì hệ thống Kavor tối nay 22:00 – 23:30", meta: "Thông báo · Hôm nay" },
            { cat: "event", title: "Sinh nhật tháng 10: 16:00 hôm nay tại pantry tầng 5", meta: "Sự kiện · Hôm nay" },
            { cat: "policy", important: true, title: "Chấm công GPS trên app Kavor áp dụng từ 01/11/2026", meta: "Chính sách · 15/10/2026" },
            { cat: "notice", title: "Đổi khu vực gửi xe máy từ ngày 20/10", meta: "Thông báo · 15/10/2026" },
            { cat: "notice", title: "Lịch nghỉ Tết Dương lịch 2027", meta: "Thông báo · 14/10/2026" },
            { cat: "event", title: "Team building quý 4 tại Đà Lạt, 13–15/11", meta: "Sự kiện · 12/10/2026" },
          ].filter((item) => newsFilter === "all" || item.cat === newsFilter).map((item) => <NewsListCard key={item.title} important={item.important} title={item.title} meta={item.meta} onPress={onOpenNews} />)}</View></>
        )}
      </ScrollView>
    </>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return <><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></>;
}

function RequestRow({ icon, title, detail, status, border = false, onPress }: { icon: IconName; title: string; detail: string; status: string; border?: boolean; onPress: () => void }) {
  return <Pressable style={[styles.requestRow, border && styles.personalRowBorder]} onPress={onPress}><View style={styles.requestIcon}><AppIcon name={icon} size={23} /></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>{title}</Text><Text style={styles.requestDetail}>{detail}</Text></View><Text style={status === "Đã duyệt" ? styles.rowStatusOk : styles.rowStatusWarn}>{status}</Text><AppIcon name="chevron-right" size={17} color="#9AA69F" /></Pressable>;
}

function NewsListCard({ title, meta, important = false, onPress }: { title: string; meta: string; important?: boolean; onPress: () => void }) {
  return <Pressable style={[styles.newsListCard, important && styles.newsListImportant]} onPress={onPress}><View style={styles.newsListIcon}><AppIcon name={important ? "alert-outline" : "newspaper-variant-outline"} size={24} color={important ? "#C84750" : "#087355"} /></View><View style={styles.newsCopy}><Text style={styles.newsListMeta}>{meta}</Text><Text style={styles.newsListTitle}>{title}</Text></View></Pressable>;
}

function DetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.detailHeader}><GlassLayer intensity={28} /><Pressable accessibilityLabel="Quay lại" style={styles.detailBack} onPress={onBack}><GlassLayer intensity={56} /><AppIcon name="arrow-left" size={22} color="#173B31" /></Pressable><Text style={styles.detailTitle}>{title}</Text><View style={styles.detailSpacer} /></View>;
}

function ClockScreen({ checkedIn, onBack, onPunch, notify }: { checkedIn: boolean; onBack: () => void; onPunch: () => void; notify: (message: string) => void }) {
  return <>
    <DetailHeader title="Chấm công" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <PunchHero checkedIn={checkedIn} onPunch={onPunch} onTap={() => notify("Nhấn giữ nút tròn trong 1 giây để chấm công")} />
      <View style={styles.reviewCard}><InfoLine label="Địa điểm" value="Văn phòng Quận 1" /><InfoLine label="Khoảng cách" value="1,8 m · trong vùng" border /><InfoLine label="Độ chính xác GPS" value="±2 m" border /><InfoLine label="Thiết bị" value="iPhone 11 · đã đăng ký" border /></View>
      <View style={styles.infoNote}><AppIcon name="map-marker-check-outline" size={21} color="#087355" /><Text style={styles.infoNoteText}>Vị trí chỉ được đọc khi bạn chủ động chấm công và không được theo dõi liên tục.</Text></View>
    </ScrollView>
  </>;
}

function ApprovalDetail({ item, onBack, onDecision }: { item: RequestItem; onBack: () => void; onDecision: (approved: boolean) => void }) {
  const initials = item.title.split(" ").map((part) => part[0]).slice(-2).join("");
  return <>
    <DetailHeader title={item.id} onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHero}><View style={styles.approvalDetailAvatar}><Text style={styles.profileAvatarText}>{initials}</Text></View><Text style={styles.profileName}>{item.title}</Text><Text style={styles.profileRole}>Nhân viên · Marketing</Text><Text style={styles.detailStatusWarn}>Chờ bạn duyệt</Text></View>
      <View style={styles.reviewCard}><InfoLine label="Loại đơn" value={item.kind === "leave" ? "Nghỉ phép" : "Giải trình công"} /><InfoLine label="Nội dung" value={item.detail} border /><InfoLine label="Lý do" value={item.reason} border /><InfoLine label="Gửi lúc" value={item.created} border /></View>
      <View style={styles.timelineCard}><View style={styles.timelineRow}><View style={styles.timelineDotDone}><AppIcon name="check" size={13} color="#FFFFFF" /></View><View><Text style={styles.timelineTitle}>Nhân viên đã gửi</Text><Text style={styles.timelineSub}>{item.created}</Text></View></View><View style={styles.timelineStem} /><View style={styles.timelineRow}><View style={styles.timelineDotCurrent}><AppIcon name="clock-outline" size={13} color="#8A681A" /></View><View><Text style={styles.timelineTitle}>Quản lý duyệt</Text><Text style={styles.timelineSub}>Đang chờ quyết định của bạn</Text></View></View></View>
    </ScrollView>
    <View style={styles.flowFooter}><View style={styles.approvalActions}><Pressable style={styles.rejectSmall} onPress={() => onDecision(false)}><Text style={styles.rejectSmallText}>Từ chối</Text></Pressable><Pressable style={styles.approveSmall} onPress={() => onDecision(true)}><Text style={styles.approveSmallText}>Duyệt đơn</Text></Pressable></View></View>
  </>;
}

function LeaveOverview({ requests, onBack, onCreate, onOpenRequest }: { requests: RequestItem[]; onBack: () => void; onCreate: () => void; onOpenRequest: (id: string) => void }) {
  const pendingDays = requests.filter((item) => item.kind === "leave" && item.status === "pending").length;
  return <>
    <DetailHeader title="Nghỉ phép" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#0C795A", "#064E3B"]} style={styles.leaveBalance}>
        <View style={styles.leaveBalanceHead}><Text style={styles.leaveBalanceCaption}>✈  PHÉP NĂM 2026</Text><Text style={styles.leaveBalanceUpdate}>Cập nhật hôm nay</Text></View>
        <View style={styles.leaveBalanceMain}><Text style={styles.leaveBalanceNumber}>6,5</Text><Text style={styles.leaveBalanceUnit}>ngày còn lại</Text><Text style={styles.leaveBalanceTotal}>14 ngày khả dụng</Text></View>
        <View style={styles.leaveMeter}><View style={[styles.leaveMeterFill, { width: "46%" }]} /></View>
        <Text style={styles.leaveMeterText}>Đã sử dụng và đang chờ: 7,5 ngày</Text>
        <View style={styles.leaveStats}><View><Text style={styles.leaveStatValue}>6,5</Text><Text style={styles.leaveStatLabel}>Đã sử dụng</Text></View><View><Text style={styles.leaveStatValue}>{pendingDays}</Text><Text style={styles.leaveStatLabel}>Đang chờ duyệt</Text></View><View><Text style={styles.leaveStatValue}>14</Text><Text style={styles.leaveStatLabel}>Tổng khả dụng</Text></View></View>
      </LinearGradient>
      <View style={styles.listCard}><PersonalRow icon="calendar-check-outline" title="Được cấp năm 2026" value="12 ngày" /><PersonalRow icon="history" title="Tồn từ 2025" value="2 ngày" border /></View>
      <View style={styles.infoNote}><AppIcon name="information-outline" size={20} color="#087355" /><Text style={styles.infoNoteText}>Ngày phép được giữ chỗ khi gửi và hoàn lại nếu đơn bị từ chối hoặc hủy.</Text></View>
      <Text style={[styles.sectionTitle, styles.flowSectionTitle]}>Đơn nghỉ của tôi</Text>
      <View style={styles.listCard}>{requests.filter((item) => item.kind === "leave").map((item, index) => <RequestRow key={item.id} icon="airplane" title={item.title} detail={item.detail} status={requestStatusLabel[item.status]} border={index > 0} onPress={() => onOpenRequest(item.id)} />)}</View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={onCreate}><Text style={styles.primaryButtonText}>Tạo đơn nghỉ</Text></Pressable></View>
  </>;
}

const leaveDates = [
  [19, "T2"], [20, "T3"], [21, "T4"], [22, "T5"], [23, "T6"], [24, "T7"], [25, "CN"], [26, "T2"], [27, "T3"], [28, "T4"], [29, "T5"], [30, "T6"],
] as const;

function LeaveForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (request: RequestItem) => void }) {
  const [leaveType, setLeaveType] = useState("Phép năm");
  const [selectedDay, setSelectedDay] = useState(27);
  const [session, setSession] = useState<"full" | "am" | "pm">("full");
  const [reason, setReason] = useState("");
  const days = session === "full" ? 1 : 0.5;
  return <>
    <DetailHeader title="Tạo đơn nghỉ" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.fieldLabel}>Loại nghỉ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{["Phép năm", "Không lương", "Kết hôn", "Ốm đau"].map((type) => <Pressable key={type} style={[styles.filterChip, leaveType === type && styles.filterChipActive]} onPress={() => setLeaveType(type)}><Text style={[styles.filterChipText, leaveType === type && styles.filterChipTextActive]}>{type}</Text></Pressable>)}</ScrollView>
      <Text style={styles.fieldLabel}>Chọn ngày nghỉ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{leaveDates.map(([day, weekday]) => { const off = weekday === "T7" || weekday === "CN"; const active = selectedDay === day; return <Pressable disabled={off} key={day} style={[styles.dateCell, off && styles.dateCellOff, active && styles.dateCellActive]} onPress={() => setSelectedDay(day)}><Text style={[styles.dateWeekday, active && styles.dateActiveText]}>{weekday}</Text><Text style={[styles.dateNumber, active && styles.dateActiveText]}>{day}</Text></Pressable>; })}</ScrollView>
      <Text style={styles.fieldLabel}>Buổi</Text>
      <View style={styles.choiceSegment}>{([['full', 'Cả ngày'], ['am', 'Buổi sáng'], ['pm', 'Buổi chiều']] as const).map(([id, label]) => <Pressable key={id} style={[styles.choiceItem, session === id && styles.choiceItemActive]} onPress={() => setSession(id)}><Text style={[styles.choiceText, session === id && styles.choiceTextActive]}>{label}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Lý do</Text>
      <TextInput accessibilityLabel="Lý do nghỉ" multiline placeholder="Ví dụ: Việc gia đình" placeholderTextColor="#A2ADA8" style={styles.textArea} value={reason} onChangeText={setReason} />
      <View style={styles.reviewCard}><InfoLine label="Số ngày nghỉ" value={`${String(days).replace('.', ',')} ngày`} /><InfoLine label="Còn lại sau đơn" value={`${String(6.5 - days).replace('.', ',')} ngày`} border /><InfoLine label="Người duyệt" value="Lê Quang Huy" border /></View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={() => onSubmit({ id: `NP-${String(selectedDay).padStart(2, "0")}10`, kind: "leave", title: leaveType === "Phép năm" ? "Nghỉ phép năm" : `Nghỉ ${leaveType.toLocaleLowerCase("vi")}`, detail: `${selectedDay}/10/2026${session === "am" ? " · buổi sáng" : session === "pm" ? " · buổi chiều" : ""} · ${String(days).replace('.', ',')} ngày`, status: "pending", created: "16/10 · 11:18", reason: reason.trim() || "Việc cá nhân" })}><Text style={styles.primaryButtonText}>Gửi đơn nghỉ</Text></Pressable></View>
  </>;
}

function ExplainForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (request: RequestItem) => void }) {
  const [day, setDay] = useState(16);
  const [kind, setKind] = useState("Quên chấm vào");
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);
  function submit() {
    if (!reason.trim()) { setShowError(true); return; }
    onSubmit({ id: `GT-${String(day).padStart(2, "0")}10`, kind: "explain", title: "Giải trình công", detail: `${day}/10/2026 · ${kind.toLocaleLowerCase("vi")}`, status: "pending", created: "16/10 · 11:18", reason: reason.trim() });
  }
  return <>
    <DetailHeader title="Giải trình công" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.warningNote}><AppIcon name="clock-alert-outline" size={22} color="#B67212" /><View style={styles.explainCopy}><Text style={styles.warningTitle}>Lượt 2/3 · hạn 22/10</Text><Text style={styles.warningText}>Sau khi gửi còn 1 lượt trong tháng 10.</Text></View></View>
      <Text style={styles.fieldLabel}>Ngày cần giải trình</Text>
      <View style={styles.wrapRow}>{[[16, "Thiếu giờ vào"], [15, "Thiếu giờ vào"], [12, "Muộn 14 phút"]].map(([value, label]) => <Pressable key={value} style={[styles.filterChip, day === value && styles.filterChipActive]} onPress={() => setDay(Number(value))}><Text style={[styles.filterChipText, day === value && styles.filterChipTextActive]}>{value}/10 · {label}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Lý do</Text>
      <View style={styles.wrapRow}>{["Quên chấm vào", "Quên chấm ra", "Đi công tác", "Lỗi thiết bị/GPS", "Khác"].map((item) => <Pressable key={item} style={[styles.filterChip, kind === item && styles.filterChipActive]} onPress={() => setKind(item)}><Text style={[styles.filterChipText, kind === item && styles.filterChipTextActive]}>{item}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Giờ đề nghị ghi nhận</Text>
      <View style={styles.timeProposal}><Pressable style={styles.timeStep}><Text style={styles.timeStepText}>−</Text></Pressable><Text style={styles.timeProposalValue}>07:58</Text><Pressable style={styles.timeStep}><Text style={styles.timeStepText}>+</Text></Pressable></View>
      <Text style={styles.fieldLabel}>Mô tả</Text>
      <TextInput accessibilityLabel="Mô tả giải trình" multiline placeholder="Ví dụ: Điện thoại hết pin lúc đến công ty..." placeholderTextColor="#A2ADA8" style={[styles.textArea, showError && styles.inputError]} value={reason} onChangeText={(text) => { setReason(text); setShowError(false); }} />
      {showError ? <Text style={styles.errorText}>Nhập mô tả để quản lý có đủ thông tin xét duyệt.</Text> : null}
      <Pressable style={styles.uploadButton}><AppIcon name="paperclip" size={20} color="#087355" /><Text style={styles.uploadText}>Thêm ảnh hoặc PDF, tối đa 5 MB</Text></Pressable>
      <View style={styles.reviewCard}><InfoLine label="Người duyệt" value="Lê Quang Huy" /></View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={submit}><Text style={styles.primaryButtonText}>Gửi giải trình</Text></Pressable></View>
  </>;
}

function InfoLine({ label, value, border = false }: { label: string; value: string; border?: boolean }) {
  return <View style={[styles.infoLine, border && styles.personalRowBorder]}><Text style={styles.infoLineLabel}>{label}</Text><Text style={styles.infoLineValue}>{value}</Text></View>;
}

function RequestDetail({ item, onBack, onCancel }: { item: RequestItem; onBack: () => void; onCancel: () => void }) {
  const approved = item.status === "approved";
  const inactive = item.status === "cancelled" || item.status === "rejected";
  return <>
    <DetailHeader title={item.id} onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <View style={styles.requestHero}><View style={styles.requestHeroIcon}><AppIcon name={requestIcon[item.kind]} size={35} color="#087355" /></View><Text style={styles.requestHeroType}>{item.title}</Text><Text style={styles.requestHeroTitle}>{item.detail}</Text><Text style={approved ? styles.detailStatusOk : inactive ? styles.detailStatusMuted : styles.detailStatusWarn}>{requestStatusLabel[item.status]}</Text></View>
      <View style={styles.reviewCard}><InfoLine label="Lý do" value={item.reason} /><InfoLine label="Gửi lúc" value={item.created} border /></View>
      <View style={styles.timelineCard}><View style={styles.timelineRow}><View style={styles.timelineDotDone}><AppIcon name="check" size={13} color="#FFFFFF" /></View><View><Text style={styles.timelineTitle}>Đã gửi</Text><Text style={styles.timelineSub}>{item.created}</Text></View></View><View style={styles.timelineStem} /><View style={styles.timelineRow}><View style={approved ? styles.timelineDotDone : styles.timelineDotCurrent}><AppIcon name={approved ? "check" : inactive ? "close" : "clock-outline"} size={13} color={approved ? "#FFFFFF" : "#8A681A"} /></View><View><Text style={styles.timelineTitle}>{approved ? "Đã duyệt" : inactive ? requestStatusLabel[item.status] : "Quản lý duyệt"}</Text><Text style={styles.timelineSub}>{approved ? "Lê Quang Huy" : inactive ? "Quy trình đã dừng" : "Đang chờ Lê Quang Huy"}</Text></View></View></View>
      {item.status === "pending" ? <Pressable style={styles.dangerButton} onPress={onCancel}><Text style={styles.dangerButtonText}>Hủy đơn</Text></Pressable> : null}
    </ScrollView>
  </>;
}

function OtForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (request: RequestItem) => void }) {
  const [day, setDay] = useState(21);
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState("");
  return <>
    <DetailHeader title="Đăng ký làm thêm" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.infoNote}><AppIcon name="weather-night" size={21} color="#087355" /><Text style={styles.infoNoteText}>OT cần được duyệt trước giờ bắt đầu. Hệ số và hạn mức do công ty cấu hình.</Text></View>
      <Text style={styles.fieldLabel}>Ngày làm thêm</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{[[20, "T3"], [21, "T4"], [22, "T5"], [23, "T6"], [24, "T7"]].map(([value, label]) => <Pressable key={value} style={[styles.dateCell, day === value && styles.dateCellActive]} onPress={() => setDay(Number(value))}><Text style={[styles.dateWeekday, day === value && styles.dateActiveText]}>{label}</Text><Text style={[styles.dateNumber, day === value && styles.dateActiveText]}>{value}</Text></Pressable>)}</ScrollView>
      <Text style={styles.fieldLabel}>Số giờ đăng ký</Text>
      <View style={styles.timeProposal}><Pressable style={styles.timeStep} onPress={() => setHours((value) => Math.max(1, value - 1))}><Text style={styles.timeStepText}>−</Text></Pressable><Text style={styles.timeProposalValue}>{hours} giờ</Text><Pressable style={styles.timeStep} onPress={() => setHours((value) => Math.min(4, value + 1))}><Text style={styles.timeStepText}>+</Text></Pressable></View>
      <Text style={styles.fieldLabel}>Khung giờ</Text>
      <View style={styles.reviewCard}><InfoLine label="Bắt đầu" value="17:30" /><InfoLine label="Kết thúc dự kiến" value={`${17 + hours}:30`} border /><InfoLine label="Người duyệt" value="Lê Quang Huy" border /></View>
      <Text style={styles.fieldLabel}>Lý do</Text>
      <TextInput accessibilityLabel="Lý do làm thêm" multiline placeholder="Ví dụ: Hoàn thành kế hoạch tháng" placeholderTextColor="#A2ADA8" style={styles.textArea} value={reason} onChangeText={setReason} />
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={() => onSubmit({ id: `OT-${String(day).padStart(2, "0")}10`, kind: "ot", title: "Làm thêm giờ", detail: `${day}/10/2026 · ${hours} giờ`, status: "pending", created: "16/10 · 11:24", reason: reason.trim() || "Hoàn thành công việc được giao" })}><Text style={styles.primaryButtonText}>Gửi đăng ký OT</Text></Pressable></View>
  </>;
}

function AdvanceOverview({ requests, onBack, onCreate, onOpenRequest }: { requests: RequestItem[]; onBack: () => void; onCreate: () => void; onOpenRequest: (id: string) => void }) {
  const advances = requests.filter((item) => item.kind === "advance");
  return <>
    <DetailHeader title="Tạm ứng lương" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#0C795A", "#064E3B"]} style={styles.advanceHero}>
        <View style={styles.leaveBalanceHead}><Text style={styles.leaveBalanceCaption}>HẠN MỨC THÁNG 10</Text><AppIcon name="shield-check-outline" size={20} color="#A7F3D0" /></View>
        <Text style={styles.advanceAmount}>4.500.000 ₫</Text>
        <Text style={styles.advanceCaption}>Tối đa 30% lương cơ bản · đăng ký trước ngày 20</Text>
        <View style={styles.advanceMeta}><Text style={styles.advanceMetaText}>Còn 1 lượt</Text><Text style={styles.advanceMetaText}>Trừ kỳ lương 10/2026</Text></View>
      </LinearGradient>
      <View style={styles.infoNote}><AppIcon name="information-outline" size={20} color="#087355" /><Text style={styles.infoNoteText}>Mỗi doanh nghiệp có thể cấu hình hạn mức, ngày chốt và chuỗi phê duyệt riêng.</Text></View>
      <Text style={[styles.sectionTitle, styles.flowSectionTitle]}>Lịch sử tạm ứng</Text>
      <View style={styles.listCard}>{advances.map((item, index) => <RequestRow key={item.id} icon="cash-multiple" title={item.title} detail={item.detail} status={requestStatusLabel[item.status]} border={index > 0} onPress={() => onOpenRequest(item.id)} />)}</View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={onCreate}><Text style={styles.primaryButtonText}>Tạo đề nghị tạm ứng</Text></Pressable></View>
  </>;
}

function AdvanceForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (request: RequestItem) => void }) {
  const [amount, setAmount] = useState(2000000);
  const [reason, setReason] = useState("");
  return <>
    <DetailHeader title="Tạm ứng lương" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.centerCaption}>Hạn mức tạm ứng tháng 10</Text><Text style={styles.moneyHero}>4.500.000 ₫</Text><Text style={styles.centerHint}>30% × lương cơ bản · trước ngày 20</Text>
      <Text style={styles.fieldLabel}>Số tiền muốn ứng</Text>
      <View style={styles.amountBox}><Text style={styles.amountValue}>{amount.toLocaleString("vi-VN")}</Text><Text style={styles.amountCurrency}>₫</Text></View>
      <View style={styles.wrapRow}>{[1000000, 2000000, 3000000, 4500000].map((value) => <Pressable key={value} style={[styles.filterChip, amount === value && styles.filterChipActive]} onPress={() => setAmount(value)}><Text style={[styles.filterChipText, amount === value && styles.filterChipTextActive]}>{value === 4500000 ? "Tối đa" : `${value / 1000000} triệu`}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Lý do</Text><TextInput accessibilityLabel="Lý do tạm ứng" multiline placeholder="Ví dụ: Chi phí y tế" placeholderTextColor="#A2ADA8" style={styles.textArea} value={reason} onChangeText={setReason} />
      <View style={styles.reviewCard}><InfoLine label="Nhận vào" value="Vietcombank •6789" /><InfoLine label="Trừ vào" value="Lương 10/2026" border /><InfoLine label="Duyệt" value="QL → HR → Kế toán" border /></View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable style={styles.primaryButton} onPress={() => onSubmit({ id: "TU-1016", kind: "advance", title: "Tạm ứng lương", detail: `${amount.toLocaleString("vi-VN")} ₫ · trừ kỳ 10/2026`, status: "pending", created: "16/10 · 11:24", reason: reason.trim() || "Chi phí cá nhân" })}><Text style={styles.primaryButtonText}>Xác nhận bằng PIN</Text></Pressable></View>
  </>;
}

const payItems = [
  { month: "09/2026", net: "18.420.000 ₫", work: "22 ngày công", published: "05/10/2026" },
  { month: "08/2026", net: "17.980.000 ₫", work: "21 ngày công", published: "05/09/2026" },
  { month: "07/2026", net: "18.150.000 ₫", work: "22 ngày công", published: "05/08/2026" },
];

function PayslipsScreen({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const pay = selected == null ? null : payItems[selected];
  return <>
    <DetailHeader title={pay ? `Tháng ${pay.month}` : "Phiếu lương"} onBack={pay ? () => setSelected(null) : onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <Pressable style={styles.eyeToggle} onPress={() => setHidden((value) => !value)}><AppIcon name={hidden ? "eye-off-outline" : "eye-outline"} size={20} color="#087355" /><Text style={styles.eyeToggleText}>{hidden ? "Hiện số tiền" : "Ẩn số tiền"}</Text></Pressable>
      <Text style={styles.centerCaption}>{pay ? "Thực lĩnh" : "Thực lĩnh tháng 09/2026"}</Text><Text style={styles.moneyHero}>{hidden ? "•••••••• ₫" : pay?.net ?? payItems[0]?.net}</Text><Text style={styles.centerHint}>{pay?.work ?? "Công bố 05/10 · đã chuyển khoản"}</Text>
      {pay ? <><View style={styles.reviewCard}><InfoLine label="Lương cơ bản" value={hidden ? "••••••" : "15.000.000 ₫"} /><InfoLine label="Phụ cấp" value={hidden ? "••••••" : "2.500.000 ₫"} border /><InfoLine label="Làm thêm giờ" value={hidden ? "••••••" : "1.820.000 ₫"} border /><InfoLine label="Thuế & bảo hiểm" value={hidden ? "••••••" : "−900.000 ₫"} border /><InfoLine label="Thực lĩnh" value={hidden ? "••••••" : pay.net} border /></View><Pressable style={styles.uploadButton} onPress={() => notify(`Đã tạo file phiếu lương ${pay.month} mẫu`)}><AppIcon name="download-outline" size={20} color="#087355" /><Text style={styles.uploadText}>Tải PDF có mật khẩu</Text></Pressable></> : <View style={styles.listCard}>{payItems.map((item, index) => <Pressable key={item.month} style={[styles.personalRow, index > 0 && styles.personalRowBorder]} onPress={() => setSelected(index)}><AppIcon name="receipt-text-outline" size={23} color="#087355" /><View style={styles.requestCopy}><Text style={styles.requestTitle}>Tháng {item.month}</Text><Text style={styles.requestDetail}>Công bố {item.published}</Text></View><Text style={styles.personalValue}>{hidden ? "••••••" : item.net}</Text><AppIcon name="chevron-right" size={18} color="#9AA69F" /></Pressable>)}</View>}
      <View style={styles.infoNote}><AppIcon name="lock-outline" size={20} color="#087355" /><Text style={styles.infoNoteText}>Phiếu lương yêu cầu xác thực lại bằng PIN hoặc sinh trắc học sau 5 phút.</Text></View>
    </ScrollView>
  </>;
}

function ProfileCover() {
  return <LinearGradient colors={["#CEF5E3", "#F4FCF8"]} style={styles.profileCover}>
    <View style={styles.profileSun} />
    <View style={[styles.profileHill, styles.profileHillLeft]} />
    <View style={[styles.profileHill, styles.profileHillRight]} />
    <View style={[styles.profileWave, styles.profileWaveBack]} />
    <View style={[styles.profileWave, styles.profileWaveFront]} />
  </LinearGradient>;
}

function ProfileStat({ icon, value, label, border = false }: { icon: IconName; value: string; label: string; border?: boolean }) {
  return <View style={[styles.profileStat, border && styles.profileStatBorder]}><View style={styles.profileStatValue}><AppIcon name={icon} size={16} color="#087355" /><Text style={styles.profileStatNumber}>{value}</Text></View><Text style={styles.profileStatLabel}>{label}</Text></View>;
}

function ProfileAction({ icon, title, danger = false, onPress }: { icon: IconName; title: string; danger?: boolean; onPress: () => void }) {
  return <Pressable style={({ pressed }) => [styles.profileAction, pressed && styles.rowPressed]} onPress={onPress}><AppIcon name={icon} size={23} color={danger ? "#C53E48" : "#087355"} /><Text style={[styles.profileActionText, danger && styles.profileActionDanger]}>{title}</Text>{danger ? null : <AppIcon name="chevron-right" size={18} color="#9AA69F" />}</Pressable>;
}

function ProfileScreen({ onBack, notify, onDevice, onWidget, onNotifications, onLogout, initialEditing = false }: { onBack: () => void; notify: (message: string) => void; onDevice: () => void; onWidget: () => void; onNotifications: () => void; onLogout: () => void; initialEditing?: boolean }) {
  const [editing, setEditing] = useState(initialEditing);
  const [phone, setPhone] = useState("0912 345 468");
  const [address, setAddress] = useState("Tân Định, TP.HCM");
  return <>
    <DetailHeader title="Hồ sơ" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <ProfileCover />
        <View style={styles.profileAvatarOverlap}><View style={styles.profileAvatarLarge}><Text style={styles.profileAvatarLargeText}>TH</Text></View></View>
        <View style={styles.profileVerifiedName}><Text style={styles.profileCardName}>Trần Thu Hà</Text><AppIcon name="check-decagram" size={21} color="#065F46" /></View>
        <Text style={styles.profileCardRole}>Senior Designer · Marketing · HD0142</Text>
        <View style={styles.profileStats}><ProfileStat icon="star-outline" value="5 năm" label="Thâm niên" /><ProfileStat icon="airplane" value="6,5" label="Ngày phép" border /><ProfileStat icon="calendar-check-outline" value="10/22" label="Ngày công" border /></View>
        <Pressable style={[styles.primaryButton, styles.profileEditButton]} onPress={() => setEditing(true)}><Text style={styles.primaryButtonText}>Đề nghị sửa thông tin</Text></Pressable>
      </View>

      <Pressable style={styles.noticeCard} onPress={() => notify("Yêu cầu HS-0221 đang chờ HR duyệt")}><View style={styles.noticeIcon}><AppIcon name="clock-alert-outline" size={25} color="#B67212" /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Đổi tài khoản ngân hàng đang chờ HR</Text><Text style={styles.noticeDetail}>Lương kỳ này vẫn vào Vietcombank •6789</Text></View><AppIcon name="chevron-right" size={18} color="#9AA69F" /></Pressable>

      <Text style={[styles.sectionTitle, styles.profileSectionTitle]}>Công việc</Text>
      <View style={styles.reviewCard}><InfoLine label="Phòng ban" value="Marketing" /><InfoLine label="Quản lý trực tiếp" value="Lê Quang Huy" border /><InfoLine label="Ngày vào làm" value="03/03/2021" border /><InfoLine label="Hợp đồng" value="Chính thức" border /></View>

      <View style={styles.profileSectionHeader}><Text style={styles.sectionTitle}>Cá nhân</Text><Pressable onPress={() => setEditing(true)}><Text style={styles.sectionLink}>Đề nghị sửa</Text></Pressable></View>
      <View style={styles.reviewCard}><InfoLine label="Điện thoại" value="0912 ••• 468" /><InfoLine label="Email" value="ha.tran@haidang.vn" border /><InfoLine label="Địa chỉ" value="Tân Định, TP.HCM" border /><InfoLine label="Liên hệ khẩn cấp" value="Trần Văn Bình" border /><InfoLine label="Ngân hàng" value="Vietcombank •6789" border /></View>

      <View style={styles.profileActionsCard}>
        <ProfileAction icon="file-document-outline" title="Hợp đồng và quyết định" onPress={() => notify("Mở trình xem hợp đồng và quyết định mẫu")} />
        <ProfileAction icon="view-grid-outline" title="Widget chấm công" onPress={onWidget} />
        <ProfileAction icon="shield-lock-outline" title="Bảo mật và thiết bị" onPress={onDevice} />
        <ProfileAction icon="bell-outline" title="Thông báo" onPress={onNotifications} />
        <ProfileAction icon="logout" title="Đăng xuất" danger onPress={onLogout} />
      </View>
    </ScrollView>

    <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
      <View style={styles.sheetLayer}><Pressable style={styles.sheetScrim} onPress={() => setEditing(false)} /><View style={styles.profileSheet}><View style={styles.sheetHandle} /><Text style={styles.sheetTitle}>Đề nghị sửa thông tin</Text><Text style={styles.sheetSubtitle}>HR sẽ kiểm tra và phê duyệt thay đổi trước khi cập nhật hồ sơ.</Text><Text style={styles.fieldLabel}>Điện thoại</Text><TextInput accessibilityLabel="Điện thoại" value={phone} onChangeText={setPhone} style={styles.loginInput} /><Text style={styles.fieldLabel}>Địa chỉ</Text><TextInput accessibilityLabel="Địa chỉ" value={address} onChangeText={setAddress} style={styles.loginInput} /><Pressable style={[styles.primaryButton, { marginTop: 22 }]} onPress={() => { setEditing(false); notify("Đã gửi yêu cầu cập nhật hồ sơ cho HR"); }}><Text style={styles.primaryButtonText}>Gửi HR phê duyệt</Text></Pressable></View></View>
    </Modal>
  </>;
}

function DeviceScreen({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  const [registered, setRegistered] = useState(false);
  return <>
    <DetailHeader title="Thiết bị chấm công" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <View style={styles.deviceIntro}><View style={styles.deviceIllustration}><AppIcon name={registered ? "cellphone-check" : "cellphone-lock"} size={58} color="#087355" /></View><Text style={styles.deviceIntroTitle}>{registered ? "Thiết bị đã được đăng ký" : "Đăng ký điện thoại này để chấm công"}</Text><Text style={styles.deviceIntroText}>Mỗi nhân viên chấm công trên một điện thoại. Khi đổi máy, bạn gửi yêu cầu để HR reset.</Text></View>
      <View style={styles.reviewCard}><InfoLine label="Thiết bị" value="iPhone 15 · iOS 26" /><InfoLine label="Tên máy" value="iPhone của Hà" border /><InfoLine label="Mã thiết bị" value="8F2A…C41" border /></View>
      <View style={styles.infoNote}><AppIcon name="shield-lock-outline" size={21} color="#087355" /><Text style={styles.infoNoteText}>Kavor chỉ dùng định danh thiết bị để bảo vệ bản ghi chấm công.</Text></View>
    </ScrollView>
    <View style={styles.flowFooter}><Pressable disabled={registered} style={registered ? styles.disabledButton : styles.primaryButton} onPress={() => { setRegistered(true); notify("Đã đăng ký thiết bị chấm công"); }}><Text style={registered ? styles.disabledButtonText : styles.primaryButtonText}>{registered ? "Đã đăng ký thiết bị này" : "Đăng ký thiết bị này"}</Text></Pressable></View>
  </>;
}

function AuthBrand() {
  return <View style={styles.authBrandCard}><View style={styles.authWordmark}><KavorMark size={58} /><Text style={styles.authWordmarkText}>Kavor</Text></View></View>;
}

function AuthPrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} style={[styles.authPrimary, styles.authPrimaryBlock, disabled && styles.authPrimaryDisabled]} onPress={onPress}><LinearGradient colors={["#129670", "#065F46", "#044E39"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authPrimaryGradient}><Text style={styles.primaryButtonText}>{label}</Text></LinearGradient></Pressable>;
}

function AuthFlowFrame({ onBack, step, title, subtitle, children, footer, otp = false }: { onBack: () => void; step?: number; title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode; otp?: boolean }) {
  return <View style={styles.authScene}><View pointerEvents="none" style={[styles.authOrb, styles.authOrbTop]} /><View pointerEvents="none" style={[styles.authOrb, styles.authOrbBottom]} /><Pressable accessibilityLabel="Quay lại" style={styles.authBack} onPress={onBack}><GlassLayer intensity={52} /><AppIcon name="chevron-left" size={22} color="#5D6B65" /></Pressable>{step ? <View style={styles.authProgress}>{[1, 2, 3].map((item) => <View key={item} style={[styles.authProgressBar, item === step && styles.authProgressBarActive]} />)}</View> : null}<ScrollView contentContainerStyle={[styles.authFlowScreen, otp && styles.authFlowOtp]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><AuthBrand /><View style={styles.authHeading}><Text style={styles.loginTitle}>{title}</Text><Text style={styles.loginSubtitle}>{subtitle}</Text></View>{children}{footer ? <View style={styles.authFootRow}>{footer}</View> : null}</ScrollView></View>;
}

function LoginScreen({ onLogin, onForgot, onActivate }: { onLogin: () => void; onForgot: () => void; onActivate: () => void }) {
  const [employeeId, setEmployeeId] = useState("HD0142");
  const [password, setPassword] = useState("demo-pass");
  const [showPassword, setShowPassword] = useState(false);
  return <View style={styles.authScene}>
    <View pointerEvents="none" style={[styles.authOrb, styles.authOrbTop]} /><View pointerEvents="none" style={[styles.authOrb, styles.authOrbBottom]} />
    <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AuthBrand />
      <View style={styles.authHeading}><Text style={styles.loginTitle}>Đăng nhập</Text><Text style={styles.loginSubtitle}>Chào mừng bạn trở lại Kavor. Đăng nhập để bắt đầu ngày làm việc.</Text></View>
      <View style={styles.authForm}>
        <View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="account-outline" size={19} color="#96A19C" /><TextInput accessibilityLabel="Mã nhân viên hoặc email" autoCapitalize="none" value={employeeId} onChangeText={setEmployeeId} placeholder="Mã nhân viên hoặc email" placeholderTextColor="#88938E" style={styles.authFieldInput} /></View>
        <View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="lock-outline" size={19} color="#96A19C" /><View style={styles.authPasswordWrap}><TextInput accessibilityLabel="Mật khẩu" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} placeholder="Mật khẩu" placeholderTextColor="#88938E" style={[styles.authFieldInput, !showPassword && password.length > 0 && styles.authPasswordHiddenInput]} />{!showPassword && password.length > 0 ? <Text pointerEvents="none" style={styles.authPasswordDots}>{"•".repeat(Math.min(password.length, 10))}</Text> : null}</View><Pressable accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} style={styles.authEye} onPress={() => setShowPassword((value) => !value)}><AppIcon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#7C8983" /></Pressable></View>
        <Pressable style={styles.authForgot} onPress={onForgot}><Text style={styles.authForgotText}>Quên mật khẩu?</Text></Pressable>
        <View style={styles.authSubmitRow}><Pressable style={[styles.authPrimary, styles.authPrimaryGrow]} onPress={onLogin}><LinearGradient colors={["#129670", "#065F46", "#044E39"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authPrimaryGradient}><Text style={styles.primaryButtonText}>Đăng nhập</Text></LinearGradient></Pressable><Pressable accessibilityLabel="Đăng nhập bằng Face ID" style={styles.faceLogin} onPress={onLogin}><GlassLayer intensity={64} /><FaceIdIcon /></Pressable></View>
        <View style={styles.loginDivider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>Hoặc</Text><View style={styles.dividerLine} /></View>
        <Pressable style={styles.ssoButton} onPress={onLogin}><GlassLayer intensity={54} /><View style={styles.ssoIcon}><AppIcon name="office-building-outline" size={19} color="#065F46" /></View><Text style={styles.ssoText}>Đăng nhập SSO công ty</Text></Pressable>
      </View>
      <View style={styles.authFootRow}><Text style={styles.authFootText}>Lần đầu sử dụng?</Text><Pressable onPress={onActivate}><Text style={styles.authActivate}> Kích hoạt tài khoản</Text></Pressable></View>
    </ScrollView>
  </View>;
}

function ActivateScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [employeeId, setEmployeeId] = useState("HD0142"); const [email, setEmail] = useState("thao.ha@haidang.vn"); const [password, setPassword] = useState(""); const [agreed, setAgreed] = useState(false);
  return <AuthFlowFrame onBack={onBack} title="Kích hoạt tài khoản" subtitle="Dùng thông tin nhân sự đã đăng ký với công ty để tạo tài khoản Kavor." footer={<><Text style={styles.authFootText}>Đã có tài khoản?</Text><Pressable onPress={onBack}><Text style={styles.authActivate}> Đăng nhập</Text></Pressable></>}><View style={styles.authForm}><View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="account-outline" size={19} color="#96A19C" /><TextInput value={employeeId} onChangeText={setEmployeeId} placeholder="Mã nhân viên" style={styles.authFieldInput} /></View><View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="email-outline" size={19} color="#96A19C" /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email công ty" style={styles.authFieldInput} /></View><View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="lock-outline" size={19} color="#96A19C" /><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Tạo mật khẩu" style={styles.authFieldInput} /><AppIcon name="information-outline" size={20} color="#7C8983" /></View><Pressable style={styles.authAgree} onPress={() => setAgreed((value) => !value)}><View style={[styles.authCheckbox, agreed && styles.authCheckboxOn]}>{agreed ? <AppIcon name="check" size={13} color="#FFFFFF" /> : null}</View><Text style={styles.authAgreeText}>Tôi đồng ý để công ty xử lý <Text style={styles.authAgreeLink}>dữ liệu cá nhân</Text> cho mục đích nhân sự.</Text></Pressable><AuthPrimaryButton label="Tiếp tục" disabled={!agreed} onPress={onContinue} /></View></AuthFlowFrame>;
}

function ForgotScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [email, setEmail] = useState("thao.ha@haidang.vn");
  return <AuthFlowFrame onBack={onBack} step={1} title="Quên mật khẩu?" subtitle="Nhập mã nhân viên hoặc email công ty. Kavor sẽ gửi mã xác thực để bạn tạo mật khẩu mới." footer={<><Text style={styles.authFootText}>Đã nhớ mật khẩu?</Text><Pressable onPress={onBack}><Text style={styles.authActivate}> Đăng nhập</Text></Pressable></>}><View style={styles.authForm}><View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="email-outline" size={19} color="#96A19C" /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Mã nhân viên hoặc email" style={styles.authFieldInput} /></View><View style={styles.resetNote}><AppIcon name="shield-lock-outline" size={18} color="#065F46" /><Text style={styles.resetNoteText}>Mã OTP có hiệu lực trong 5 phút và chỉ dùng được một lần.</Text></View><AuthPrimaryButton label="Gửi mã xác thực" onPress={onContinue} /></View></AuthFlowFrame>;
}

function OtpScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [code, setCode] = useState("48");
  return <AuthFlowFrame onBack={onBack} step={2} otp title="Nhập mã OTP" subtitle={<Text>Mã xác thực 6 số đã được gửi đến{"\n"}<Text style={styles.authSubtitleStrong}>thao.ha@haidang.vn</Text></Text>}><View><View style={styles.otpBoxes}>{Array.from({ length: 6 }, (_, index) => <TextInput key={index} accessibilityLabel={`Số OTP ${index + 1}`} keyboardType="number-pad" maxLength={1} value={code[index] ?? ""} onChangeText={(digit) => setCode((current) => `${current.slice(0, index)}${digit.replace(/\D/g, "").slice(-1)}${current.slice(index + 1)}`.slice(0, 6))} style={[styles.otpBox, code[index] && styles.otpBoxFilled, styles.otpDigit]} />)}</View><AuthPrimaryButton label="Xác nhận" disabled={code.length < 6} onPress={onContinue} /><View style={styles.otpResend}><Text style={styles.authFootText}>Chưa nhận được mã?</Text><Pressable onPress={() => setCode("")}><Text style={styles.authAgreeLink}> Gửi lại OTP</Text></Pressable></View></View></AuthFlowFrame>;
}

function ResetPasswordScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("Kavor@2026");
  const [confirm, setConfirm] = useState("Kavor@2026");
  const valid = password.length >= 8 && password === confirm;
  return <AuthFlowFrame onBack={onBack} step={3} title="Tạo mật khẩu mới" subtitle="Chọn mật khẩu khác với mật khẩu gần nhất để bảo vệ tài khoản của bạn."><View style={styles.authForm}><View style={styles.authField}><GlassLayer intensity={48} /><AppIcon name="lock-outline" size={19} color="#96A19C" /><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Mật khẩu mới" style={styles.authFieldInput} /></View><View style={[styles.authField, confirm.length > 0 && !valid && styles.authFieldError]}><GlassLayer intensity={48} /><AppIcon name="lock-outline" size={19} color="#96A19C" /><TextInput secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Nhập lại mật khẩu" style={styles.authFieldInput} /></View><View style={styles.passwordRules}><Text style={styles.passwordRule}>Ít nhất 8 ký tự</Text><Text style={styles.passwordRule}>Có chữ và số</Text><Text style={styles.passwordRule}>Có chữ hoa</Text><Text style={styles.passwordRule}>Không chứa mã NV</Text></View>{confirm.length > 0 && !valid ? <Text style={styles.errorText}>Hai mật khẩu chưa khớp.</Text> : null}<AuthPrimaryButton label="Đặt lại mật khẩu" disabled={!valid} onPress={onDone} /></View></AuthFlowFrame>;
}

function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [readAll, setReadAll] = useState(false);
  const items = [["Còn 6 ngày để giải trình công tháng 10", "Ngày 15/10 thiếu giờ vào · 08:00", "clock-alert-outline"], ["Đơn OT-0418 đã được duyệt", "Lê Quang Huy duyệt · Hôm qua", "check-all"], ["Bản tin mới: chấm công GPS", "Phòng Nhân sự · 15/10", "newspaper-variant-outline"], ["Phiếu lương 09/2026 đã công bố", "Xác thực để xem chi tiết · 05/10", "receipt-text-outline"], ["Tạm ứng TU-0912 đã chi", "3.000.000 ₫ vào Vietcombank •6789 · 12/09", "cash-check"]] as const;
  return <><DetailHeader title="Thông báo" onBack={onBack} /><ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}><Pressable style={styles.readAll} onPress={() => setReadAll(true)}><Text style={styles.linkButtonText}>{readAll ? "Đã đọc tất cả" : "Đánh dấu tất cả đã đọc"}</Text></Pressable><View style={styles.listCard}>{items.map((item, index) => <View key={item[0]} style={[styles.requestRow, index > 0 && styles.personalRowBorder]}><View style={styles.requestIcon}><AppIcon name={item[2]} size={23} /></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>{item[0]}</Text><Text style={styles.requestDetail}>{item[1]}</Text></View>{!readAll && index < 2 ? <View style={styles.unreadDot} /> : null}</View>)}</View></ScrollView></>;
}

function NewsDetailScreen({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  return <><DetailHeader title="Bản tin" onBack={onBack} /><ScrollView contentContainerStyle={styles.articleContent} showsVerticalScrollIndicator={false}>
    <LinearGradient colors={["#FFF0EA", "#FFF9F5", "#E6F8F0"]} style={styles.newsDetailHero}><View style={styles.newsHeroTop}><View style={styles.newsCategory}><AppIcon name="book-open-page-variant-outline" size={16} color="#087355" /><Text style={styles.newsCategoryText}>Chính sách</Text></View><View style={styles.importantTag}><AppIcon name="alert-outline" size={11} color="#FFFFFF" /><Text style={styles.importantText}>Quan trọng</Text></View></View><View style={styles.newsHeroIcon}><AppIcon name="map-marker-radius-outline" size={31} color="#C84750" /></View><Text style={styles.newsHeroTitle}>Chấm công GPS trên app Kavor áp dụng từ 01/11/2026</Text><View style={styles.newsByline}><View style={styles.newsByAvatar}><Text style={styles.newsByAvatarText}>NS</Text></View><View><Text style={styles.newsByName}>Phòng Nhân sự</Text><Text style={styles.newsByMeta}>15/10/2026 · 3 phút đọc</Text></View></View></LinearGradient>
    <View style={styles.newsCallout}><View style={styles.newsCalloutIcon}><AppIcon name="alert-outline" size={21} color="#C84750" /></View><View style={styles.requestCopy}><Text style={styles.newsCalloutTitle}>Bạn cần biết</Text><Text style={styles.newsCalloutText}>Quy định chấm công mới bắt đầu áp dụng từ ngày 01/11/2026.</Text></View></View>
    <View style={styles.newsBodyCard}><View style={styles.newsBodyHeading}><AppIcon name="book-open-page-variant-outline" size={17} color="#087355" /><Text style={styles.newsBodyHeadingText}>NỘI DUNG</Text></View><Text style={styles.articleBody}>Từ ngày 01/11/2026, nhân viên khối văn phòng chấm công vào/ra ca trên app Kavor thay cho máy vân tay ở sảnh.{"\n\n"}Mỗi người đăng ký một điện thoại để chấm công. Khi đổi máy, gửi yêu cầu reset trong Hồ sơ → Bảo mật và thiết bị.{"\n\n"}✓ Bán kính chấm công: 3 m quanh điểm đặt tại văn phòng.{"\n"}✓ Quên chấm hoặc lỗi định vị: gửi giải trình, tối đa 3 lần/tháng.{"\n"}✓ Hạn giải trình: trước ngày chốt công 3 ngày.</Text><Pressable style={styles.newsFile} onPress={() => notify("Mở Quy-dinh-cham-cong-GPS.pdf trong trình xem PDF")}><View style={styles.requestIcon}><AppIcon name="file-pdf-box" size={23} /></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>Quy-dinh-cham-cong-GPS.pdf</Text><Text style={styles.requestDetail}>412 KB</Text></View><AppIcon name="download-outline" size={19} color="#7A8781" /></Pressable></View>
    <View style={styles.newsActions}><Pressable style={styles.newsActionButton} onPress={() => notify("Đã lưu bài viết")}><AppIcon name="pin-outline" size={18} /><Text style={styles.newsActionText}>Lưu tin</Text></Pressable><Pressable style={styles.newsActionButton} onPress={() => notify("Đã sao chép liên kết bài viết")}><AppIcon name="share-variant-outline" size={18} /><Text style={styles.newsActionText}>Chia sẻ</Text></Pressable></View>
  </ScrollView></>;
}

function WidgetGuideScreen({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  const steps = [["Nhấn giữ vùng trống trên màn hình chính", "Chọn Sửa → Thêm tiện ích"], ["Tìm “Kavor”, chọn cỡ vừa", "Cỡ vừa có nút chấm công, cỡ nhỏ chỉ xem trạng thái"], ["Đến văn phòng và chạm Vào ca", "Widget kiểm tra vị trí rồi báo kết quả tại chỗ"]];
  return <><DetailHeader title="Widget chấm công" onBack={onBack} /><ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}><LinearGradient colors={["#315C50", "#173B31"]} style={styles.widgetWall}><View style={styles.widgetPreview}><Text style={styles.widgetBrand}>KAVOR</Text><Text style={styles.widgetTime}>07:58</Text><Text style={styles.widgetShift}>Thứ Sáu, 16/10 · Trong vùng 1,8 m</Text><View style={styles.widgetAction}><Text style={styles.widgetActionText}>VÀO CA</Text></View></View></LinearGradient><Text style={[styles.sectionTitle, styles.flowSectionTitle]}>Thêm widget trên iPhone</Text><View style={styles.timelineCard}>{steps.map((step, index) => <View key={step[0]}><View style={styles.timelineRow}><View style={styles.timelineDotDone}><AppIcon name="check" size={13} color="#FFFFFF" /></View><View style={styles.requestCopy}><Text style={styles.timelineTitle}>{step[0]}</Text><Text style={styles.timelineSub}>{step[1]}</Text></View></View>{index < steps.length - 1 ? <View style={styles.timelineStem} /> : null}</View>)}</View><View style={styles.infoNote}><AppIcon name="shield-lock-outline" size={20} color="#087355" /><Text style={styles.infoNoteText}>Widget chỉ chạy trên thiết bị đã đăng ký và khi bạn còn đăng nhập. Mỗi lần chạm đều xác thực vị trí.</Text></View><View style={[styles.approvalActions, { marginTop: 14 }]}><Pressable style={styles.rejectSmall} onPress={() => notify("Đã mở mô phỏng màn hình khóa")}><Text style={[styles.rejectSmallText, { color: "#087355" }]}>Màn hình khóa</Text></Pressable><Pressable style={styles.approveSmall} onPress={() => notify("Đã mở mô phỏng màn hình chính")}><Text style={styles.approveSmallText}>Xem mô phỏng</Text></Pressable></View></ScrollView></>;
}

function DoneScreen({ kind, onViewRequests, onHome }: { kind: RequestKind; onViewRequests: () => void; onHome: () => void }) {
  const isLeave = kind === "leave";
  const title = isLeave ? "Đã gửi đơn nghỉ" : kind === "ot" ? "Đã gửi đăng ký OT" : kind === "advance" ? "Đã gửi đề nghị tạm ứng" : "Đã gửi yêu cầu giải trình";
  const detail = isLeave ? "Ngày phép đã được giữ chỗ đến khi đơn được duyệt." : kind === "ot" ? "Quản lý sẽ nhận thông báo để duyệt thời gian làm thêm." : kind === "advance" ? "Đề nghị sẽ lần lượt qua Quản lý, HR và Kế toán." : "Lê Quang Huy sẽ nhận thông báo để duyệt yêu cầu.";
  return <View style={styles.doneScreen}><View style={styles.doneIcon}><AppIcon name="check" size={45} color="#FFFFFF" /></View><Text style={styles.doneTitle}>{title}</Text><Text style={styles.doneText}>{detail}</Text><Pressable style={styles.primaryButton} onPress={onViewRequests}><Text style={styles.primaryButtonText}>Xem đơn của tôi</Text></Pressable><Pressable style={styles.linkButton} onPress={onHome}><Text style={styles.linkButtonText}>Về trang chủ</Text></Pressable></View>;
}

function DockTab({ tab, active, onPress }: { tab: (typeof tabs)[number]; active: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(active ? 1 : 0.92)).current;
  useEffect(() => {
    if (reduced) { scale.setValue(active ? 1 : 0.92); return; }
    Animated.spring(scale, { toValue: active ? 1 : 0.92, speed: 22, bounciness: 7, useNativeDriver: true }).start();
  }, [active, reduced, scale]);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.dockItem, active && styles.dockItemActive]} onPress={onPress}><Animated.View style={[styles.dockItemContent, { transform: [{ scale }] }]}><AppIcon name={active ? tab.activeIcon : tab.icon} size={23} color={active ? "#065F46" : "#6D7973"} />{active ? <Text style={styles.dockLabel}>{tab.label}</Text> : null}</Animated.View></Pressable>;
}

function Dock({ activeTab, setActiveTab, quickOpen, setQuickOpen, openFlow, tucked, bottomInset }: { activeTab: TabId; setActiveTab: (tab: TabId) => void; quickOpen: boolean; setQuickOpen: (open: boolean) => void; openFlow: (flow: FlowId) => void; tucked: boolean; bottomInset: number }) {
  const reduced = useReducedMotion();
  const quickAnim = useRef(new Animated.Value(quickOpen ? 1 : 0)).current;
  const dockAnim = useRef(new Animated.Value(tucked ? 0 : 1)).current;
  useEffect(() => {
    if (reduced) { quickAnim.setValue(quickOpen ? 1 : 0); return; }
    Animated.spring(quickAnim, { toValue: quickOpen ? 1 : 0, speed: 22, bounciness: quickOpen ? 8 : 2, useNativeDriver: true }).start();
  }, [quickAnim, quickOpen, reduced]);
  useEffect(() => {
    if (reduced) { dockAnim.setValue(tucked ? 0 : 1); return; }
    Animated.timing(dockAnim, { toValue: tucked ? 0 : 1, duration: tucked ? 360 : 420, easing: Easing.bezier(0.22, 0.8, 0.24, 1), useNativeDriver: true }).start();
  }, [dockAnim, reduced, tucked]);
  function runQuickAction(nextFlow: FlowId) {
    setQuickOpen(false);
    setTimeout(() => openFlow(nextFlow), 110);
  }
  return (
    <>
      <Animated.View pointerEvents={quickOpen ? "auto" : "none"} style={[styles.quickScrim, { opacity: quickAnim }]}><GlassLayer intensity={28} /><Pressable style={StyleSheet.absoluteFill} onPress={() => setQuickOpen(false)} /></Animated.View>
      <Animated.View pointerEvents={quickOpen ? "auto" : "none"} style={[styles.quickMenu, { bottom: bottomInset + 80, transform: [{ translateY: quickAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>{quickCreate.map((item, index) => { const start = (quickCreate.length - 1 - index) * 0.055; return <Animated.View key={item.label} style={{ opacity: quickAnim.interpolate({ inputRange: [start, Math.min(1, start + 0.42)], outputRange: [0, 1], extrapolate: "clamp" }), transform: [{ translateY: quickAnim.interpolate({ inputRange: [start, Math.min(1, start + 0.5)], outputRange: [22, 0], extrapolate: "clamp" }) }, { scale: quickAnim.interpolate({ inputRange: [start, Math.min(1, start + 0.5)], outputRange: [0.86, 1], extrapolate: "clamp" }) }] }}><Pressable style={styles.quickItem} onPress={() => runQuickAction(item.flow)}><View style={styles.quickLabel}><GlassLayer intensity={74} /><Text style={styles.quickLabelText}>{item.label}</Text><Text style={styles.quickLabelSub}>{item.detail}</Text></View><View style={styles.quickCircle}><GlassLayer intensity={74} /><AppIcon name={item.icon} size={24} /></View></Pressable></Animated.View>; })}</Animated.View>
      <Animated.View pointerEvents={tucked ? "none" : "auto"} style={[styles.dock, { bottom: bottomInset, opacity: dockAnim, transform: [{ translateY: dockAnim.interpolate({ inputRange: [0, 1], outputRange: [98 + bottomInset, 0] }) }] }]}>
        <View style={[styles.dockPill, quickOpen && styles.dockPillDim]}>
          <GlassLayer intensity={82} />
          <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.54)", "rgba(255,255,255,0.18)", "rgba(255,255,255,0.36)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {tabs.map((tab) => <DockTab key={tab.id} tab={tab} active={activeTab === tab.id} onPress={() => setActiveTab(tab.id)} />)}
        </View>
        <Animated.View style={[styles.fabWrap, { transform: [{ rotate: quickAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }]}><Pressable accessibilityLabel="Tạo nhanh" style={({ pressed }) => [styles.fabWrap, pressed && styles.punchPressed]} onPress={() => setQuickOpen(!quickOpen)}><LinearGradient colors={["#15936D", "#065F46", "#044E39"]} style={styles.fab}><AppIcon name="plus" size={30} color="#FFFFFF" /></LinearGradient></Pressable></Animated.View>
      </Animated.View>
    </>
  );
}

function AnimatedToast({ message }: { message: string }) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { value.setValue(1); return; }
    Animated.spring(value, { toValue: 1, speed: 24, bounciness: 7, useNativeDriver: true }).start();
  }, [reduced, value]);
  return <Animated.View style={[styles.toast, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}><AppIcon name="check-circle-outline" size={18} color="#087355" /><Text style={styles.toastText}>{message}</Text></Animated.View>;
}

function PinGate({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!visible) setCode("");
  }, [visible]);
  useEffect(() => {
    if (code.length !== 6) return;
    const timer = setTimeout(onSuccess, 240);
    return () => clearTimeout(timer);
  }, [code, onSuccess]);
  const key = (value: number | "delete") => setCode((current) => value === "delete" ? current.slice(0, -1) : current.length < 6 ? `${current}${value}` : current);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetLayer}><Pressable style={styles.sheetScrim} onPress={onClose} /><View style={styles.pinSheet}><View style={styles.sheetHandle} /><Text style={styles.sheetTitle}>Xác thực để tiếp tục</Text><Text style={styles.sheetSubtitle}>Nhập PIN 6 số để xem dữ liệu lương và tạm ứng.</Text><View style={styles.pinDots}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.pinDot, index < code.length && styles.pinDotActive]} />)}</View><View style={styles.keypad}>{[1,2,3,4,5,6,7,8,9].map((number) => <Pressable key={number} style={({ pressed }) => [styles.keypadKey, pressed && styles.keypadPressed]} onPress={() => key(number)}><Text style={styles.keypadText}>{number}</Text></Pressable>)}<Pressable accessibilityLabel="Dùng Face ID" style={styles.keypadPlain} onPress={onSuccess}><FaceIdIcon size={30} color="#087355" /></Pressable><Pressable style={({ pressed }) => [styles.keypadKey, pressed && styles.keypadPressed]} onPress={() => key(0)}><Text style={styles.keypadText}>0</Text></Pressable><Pressable style={styles.keypadPlain} onPress={() => key("delete")}><AppIcon name="backspace-outline" size={25} color="#65736D" /></Pressable></View></View></View></Modal>;
}

function KavorApp() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Montserrat_300Light, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold });
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [signedIn, setSignedIn] = useState(false);
  const [flow, setFlow] = useState<FlowId | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>(initialRequests);
  const [approvals, setApprovals] = useState<RequestItem[]>(initialApprovals);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [doneKind, setDoneKind] = useState<RequestKind>("leave");
  const [authIntent, setAuthIntent] = useState<"activate" | "reset">("reset");
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pendingFlow, setPendingFlow] = useState<FlowId | null>(null);
  const [dockTucked, setDockTucked] = useState(false);
  const [headerGlass, setHeaderGlass] = useState(false);
  const lastScrollY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    const routeUrl = (url: string | null) => {
      if (!url) return;
      const route = url.replace(/^kavor:\/\//, "").split(/[/?#]/)[0];
      if (route === "login") {
        setSignedIn(false);
        setFlow("login");
      } else if (route === "activate" || route === "forgot" || route === "otp" || route === "resetPassword") {
        setSignedIn(false);
        setFlow(route);
      } else if (route === "home" || route === "attendance" || route === "requests" || route === "news") {
        setSignedIn(true);
        setFlow(null);
        setActiveTab(route);
        setQuickOpen(route === "home" && url.includes("quick=1"));
      } else if (route === "profile" || route === "profileEdit" || route === "clock" || route === "notifications" || route === "widget" || route === "device" || route === "newsDetail" || route === "leave" || route === "leaveNew" || route === "explain" || route === "ot" || route === "advance" || route === "advanceNew" || route === "payslips") {
        setSignedIn(true);
        setFlow(route);
      }
    };
    Linking.getInitialURL().then(routeUrl);
    const subscription = Linking.addEventListener("url", (event) => routeUrl(event.url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setDockTucked(false);
    setHeaderGlass(false);
    lastScrollY.current = 0;
  }, [activeTab, flow]);

  function handlePrimaryScroll(y: number, _nearEnd: boolean) {
    const delta = y - lastScrollY.current;
    setHeaderGlass(y > 24);
    if (y < 24 || delta < -4) setDockTucked(false);
    else if (delta > 4) setDockTucked(true);
    lastScrollY.current = y;
  }

  function notify(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 2400);
  }

  function openFlow(nextFlow: FlowId) {
    setQuickOpen(false);
    if (!pinUnlocked && (nextFlow === "payslips" || nextFlow === "advance" || nextFlow === "advanceNew")) {
      setPendingFlow(nextFlow);
      setPinVisible(true);
      return;
    }
    setFlow(nextFlow);
  }

  function completePin() {
    setPinUnlocked(true);
    setPinVisible(false);
    if (pendingFlow) setFlow(pendingFlow);
    setPendingFlow(null);
    notify("Xác thực thành công");
  }

  function openRequest(id: string) {
    setSelectedRequestId(id);
    openFlow("requestDetail");
  }

  function openApproval(id: string) {
    setSelectedApprovalId(id);
    openFlow("approvalDetail");
  }

  function decideApproval(id: string, approved: boolean) {
    setApprovals((current) => current.filter((item) => item.id !== id));
    notify(`${approved ? "Đã duyệt" : "Đã từ chối"} ${id}`);
    setFlow(null);
  }

  function submitRequest(request: RequestItem) {
    setRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
    setDoneKind(request.kind);
    setFlow("done");
  }

  const selectedRequest = requests.find((item) => item.id === selectedRequestId);
  const selectedApproval = approvals.find((item) => item.id === selectedApprovalId);

  if (!fontsLoaded) return <View style={styles.loading} />;

  let content: ReactNode;
  if (!signedIn) {
    content = flow === "activate" ? <ActivateScreen onBack={() => setFlow("login")} onContinue={() => { setAuthIntent("activate"); setFlow("otp"); }} />
      : flow === "forgot" ? <ForgotScreen onBack={() => setFlow("login")} onContinue={() => { setAuthIntent("reset"); setFlow("otp"); }} />
      : flow === "otp" ? <OtpScreen onBack={() => setFlow(authIntent === "activate" ? "activate" : "forgot")} onContinue={() => { if (authIntent === "activate") { setSignedIn(true); setFlow(null); notify("Kích hoạt tài khoản thành công"); } else setFlow("resetPassword"); }} />
      : flow === "resetPassword" ? <ResetPasswordScreen onBack={() => setFlow("otp")} onDone={() => { setFlow("login"); notify("Đã cập nhật mật khẩu, hãy đăng nhập lại"); }} />
      : <LoginScreen onLogin={() => { setSignedIn(true); setFlow(null); notify("Đăng nhập thành công"); }} onForgot={() => setFlow("forgot")} onActivate={() => setFlow("activate")} />;
  } else if (flow === "leave") content = <LeaveOverview requests={requests} onBack={() => setFlow(null)} onCreate={() => setFlow("leaveNew")} onOpenRequest={openRequest} />;
  else if (flow === "leaveNew") content = <LeaveForm onBack={() => setFlow("leave")} onSubmit={submitRequest} />;
  else if (flow === "explain") content = <ExplainForm onBack={() => setFlow(null)} onSubmit={submitRequest} />;
  else if (flow === "ot") content = <OtForm onBack={() => setFlow(null)} onSubmit={submitRequest} />;
  else if (flow === "advance") content = <AdvanceOverview requests={requests} onBack={() => setFlow(null)} onCreate={() => setFlow("advanceNew")} onOpenRequest={openRequest} />;
  else if (flow === "advanceNew") content = <AdvanceForm onBack={() => setFlow("advance")} onSubmit={submitRequest} />;
  else if (flow === "payslips") content = <PayslipsScreen onBack={() => setFlow(null)} notify={notify} />;
  else if (flow === "profile" || flow === "profileEdit") content = <ProfileScreen initialEditing={flow === "profileEdit"} onBack={() => setFlow(null)} notify={notify} onDevice={() => setFlow("device")} onWidget={() => setFlow("widget")} onNotifications={() => setFlow("notifications")} onLogout={() => { setSignedIn(false); setFlow("login"); }} />;
  else if (flow === "device") content = <DeviceScreen onBack={() => setFlow("profile")} notify={notify} />;
  else if (flow === "clock") content = <ClockScreen checkedIn={checkedIn} onBack={() => setFlow(null)} onPunch={() => { setCheckedIn((value) => !value); notify(checkedIn ? "Đã ghi nhận ra ca" : "Đã ghi nhận vào ca lúc 07:58"); }} notify={notify} />;
  else if (flow === "approvalDetail" && selectedApproval) content = <ApprovalDetail item={selectedApproval} onBack={() => setFlow(null)} onDecision={(approved) => decideApproval(selectedApproval.id, approved)} />;
  else if (flow === "notifications") content = <NotificationsScreen onBack={() => setFlow(null)} />;
  else if (flow === "newsDetail") content = <NewsDetailScreen onBack={() => setFlow(null)} notify={notify} />;
  else if (flow === "widget") content = <WidgetGuideScreen onBack={() => setFlow(null)} notify={notify} />;
  else if (flow === "requestDetail" && selectedRequest) content = <RequestDetail item={selectedRequest} onBack={() => setFlow(null)} onCancel={() => { setRequests((current) => current.map((item) => item.id === selectedRequest.id ? { ...item, status: "cancelled" } : item)); notify(`Đã hủy đơn ${selectedRequest.id}`); setFlow(null); }} />;
  else if (flow === "done") content = <DoneScreen kind={doneKind} onViewRequests={() => { setActiveTab("requests"); setFlow(null); }} onHome={() => { setActiveTab("home"); setFlow(null); }} />;
  else if (activeTab === "home") content = <HomeScreen checkedIn={checkedIn} notify={notify} openFlow={openFlow} onNews={() => setActiveTab("news")} onPunch={() => { setCheckedIn((value) => !value); notify(checkedIn ? "Đã ghi nhận ra ca" : "Đã ghi nhận vào ca lúc 07:58"); }} onPrimaryScroll={handlePrimaryScroll} headerGlass={headerGlass} />;
  else content = <SecondaryScreen tab={activeTab} notify={notify} requests={requests} approvals={approvals} onOpenRequest={openRequest} onOpenApproval={openApproval} onDecision={decideApproval} onOpenExplain={() => openFlow("explain")} onOpenNews={() => openFlow("newsDetail")} onPrimaryScroll={handlePrimaryScroll} headerGlass={headerGlass} />;

  const sceneKey = signedIn ? (flow ?? activeTab) : (flow ?? "login");

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <DecorativeBackground />
      <View style={styles.app}>
        <View style={[styles.safeFrame, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><MotionScreen key={sceneKey} variant={flow || !signedIn ? "push" : "fade"}>{content}</MotionScreen></View>
        {signedIn && !flow ? <Dock activeTab={activeTab} setActiveTab={(tab) => { setQuickOpen(false); setDockTucked(false); setActiveTab(tab); }} quickOpen={quickOpen} setQuickOpen={setQuickOpen} openFlow={openFlow} tucked={dockTucked} bottomInset={Math.max(12, insets.bottom - 10)} /> : null}
        {message ? <AnimatedToast key={message} message={message} /> : null}
      </View>
      <PinGate visible={pinVisible} onClose={() => { setPinVisible(false); setPendingFlow(null); }} onSuccess={completePin} />
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><KavorApp /></SafeAreaProvider>;
}

const fonts = { regular: "Montserrat_400Regular", medium: "Montserrat_500Medium", semibold: "Montserrat_600SemiBold", bold: "Montserrat_700Bold", light: "Montserrat_300Light" } as const;

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#FFFFFF" },
  root: { flex: 1, backgroundColor: "#F8FCFA" },
  app: { flex: 1, backgroundColor: "transparent", overflow: "hidden" },
  safeFrame: { flex: 1, backgroundColor: "transparent" },
  scene: { flex: 1 },
  blob: { position: "absolute", borderRadius: 999, overflow: "hidden" },
  blobTop: { width: 370, height: 370, top: -170, left: -165 },
  blobRight: { width: 310, height: 310, top: 285, right: -185 },
  blobBottom: { width: 340, height: 340, bottom: -185, left: -90 },
  header: { height: 61, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 3, overflow: "hidden" },
  headerGlass: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.78)", backgroundColor: "rgba(255,255,255,0.32)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
  circleButton: { width: 42, height: 42, borderRadius: 21, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.42)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", shadowColor: "#064632", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  notificationDot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: "#D9474F", borderWidth: 2, borderColor: "#FFFFFF" },
  companyName: { flex: 1, textAlign: "center", color: "#20362F", fontSize: 14, letterSpacing: 2.2, fontFamily: fonts.regular },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#197E60", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 9, elevation: 3 },
  avatarText: { color: "#FFFFFF", fontSize: 12, fontFamily: fonts.semibold },
  homeContent: { paddingHorizontal: 20, paddingBottom: 118 },
  newsSection: { marginTop: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: "#13241E", fontSize: 16, fontFamily: fonts.bold },
  sectionLink: { color: "#065F46", fontSize: 12.5, fontFamily: fonts.semibold },
  newsCard: { minHeight: 84, borderRadius: 20, padding: 13, flexDirection: "row", gap: 12, backgroundColor: "rgba(255,243,244,0.82)", borderWidth: 1, borderColor: "rgba(255,214,216,0.95)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
  newsCardInactive: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  newsCardNormal: { backgroundColor: "rgba(255,255,255,0.82)", borderColor: "rgba(255,255,255,0.96)" },
  carouselTrack: { marginHorizontal: -20, overflow: "visible" },
  newsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFECEE", alignItems: "center", justifyContent: "center" },
  newsIconNormal: { backgroundColor: "#EAF7F1" },
  newsCopy: { flex: 1, gap: 5 },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  importantTag: { height: 20, paddingHorizontal: 7, borderRadius: 8, backgroundColor: "#D24E57", flexDirection: "row", alignItems: "center", gap: 3 },
  normalTag: { backgroundColor: "#168563" },
  importantText: { color: "#FFFFFF", fontSize: 10, fontFamily: fonts.bold },
  newsDate: { color: "#97A39D", fontSize: 11, fontFamily: fonts.medium },
  newsTitle: { color: "#13241E", fontSize: 14, lineHeight: 19, fontFamily: fonts.semibold },
  carouselDots: { height: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#DCE2DF" },
  carouselDotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: "#065F46" },
  hero: { alignItems: "center", marginTop: -1 },
  heroTime: { color: "#1D3B32", fontSize: 52, lineHeight: 56, letterSpacing: -1.4, fontFamily: fonts.light },
  heroDate: { color: "#7A8781", fontSize: 17, marginTop: 1, fontFamily: fonts.regular },
  shiftChip: { minHeight: 30, marginTop: 8, paddingHorizontal: 12, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.08, shadowRadius: 10 },
  shiftText: { color: "#5D6B65", fontSize: 12, fontFamily: fonts.medium },
  punchStage: { width: "100%", height: 216, marginTop: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mapSquare: { position: "absolute", width: 22, height: 22, borderRadius: 5, backgroundColor: "rgba(222,247,235,0.78)" },
  crossLineA: { position: "absolute", width: 460, height: 44, backgroundColor: "rgba(255,255,255,0.65)", transform: [{ rotate: "31deg" }] },
  crossLineB: { position: "absolute", width: 430, height: 38, backgroundColor: "rgba(255,255,255,0.58)", transform: [{ rotate: "-56deg" }] },
  haloOuter: { position: "absolute", width: 212, height: 212, borderRadius: 106, backgroundColor: "rgba(167,243,208,0.24)" },
  haloInner: { position: "absolute", width: 186, height: 186, borderRadius: 93, backgroundColor: "rgba(255,255,255,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 2 },
  holdRing: { position: "absolute", width: 174, height: 174, borderRadius: 87, borderWidth: 3, borderStyle: "dashed", borderColor: "#36BD8C", zIndex: 5 },
  punchPressable: { width: 160, height: 160, borderRadius: 80, zIndex: 4 },
  punchPressed: { transform: [{ scale: 0.96 }], opacity: 0.92 },
  punchOrb: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", shadowColor: "#064632", shadowOpacity: 0.42, shadowRadius: 22, shadowOffset: { width: 0, height: 13 }, elevation: 9 },
  punchTitle: { color: "#FFFFFF", fontSize: 15, letterSpacing: 0.7, marginTop: 2, fontFamily: fonts.semibold },
  punchTitleOut: { color: "#065F46" },
  punchHint: { color: "rgba(255,255,255,0.82)", fontSize: 10, marginTop: 1, fontFamily: fonts.medium },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: -2 },
  locationText: { color: "#1D3B32", fontSize: 13.5, fontFamily: fonts.medium },
  heroStats: { width: "100%", flexDirection: "row", marginTop: 10 },
  heroStat: { flex: 1, alignItems: "center", gap: 3 },
  heroStatValue: { color: "#13241E", fontSize: 18, marginTop: 1, fontFamily: fonts.bold },
  heroStatLabel: { color: "#97A39D", fontSize: 11.5, fontFamily: fonts.medium },
  noticeCard: { minHeight: 72, borderRadius: 20, padding: 12, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  noticeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF4DC", alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  noticeDetail: { color: "#68766F", fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  noticeLimit: { color: "#B67212", fontSize: 11.5, fontFamily: fonts.semibold },
  personalTitle: { marginTop: 22, marginBottom: 11 },
  listCard: { borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 3 },
  personalRow: { minHeight: 59, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 11 },
  rowPressed: { backgroundColor: "rgba(6,95,70,0.055)" },
  personalRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(6,95,70,0.08)" },
  personalLabel: { flex: 1, color: "#263A33", fontSize: 12.5, fontFamily: fonts.semibold },
  personalValue: { color: "#263A33", fontSize: 11.5, fontFamily: fonts.semibold },
  shortcutsCard: { borderRadius: 22, paddingVertical: 18, paddingHorizontal: 8, marginTop: 18, flexDirection: "row", flexWrap: "wrap", backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 16 },
  shortcut: { width: "25%", minHeight: 65, alignItems: "center", justifyContent: "center", gap: 8 },
  shortcutLabel: { color: "#5D6B65", fontSize: 10.5, textAlign: "center", fontFamily: fonts.medium },
  secondaryContent: { paddingHorizontal: 20, paddingBottom: 118 },
  screenTitle: { color: "#13241E", fontSize: 22, marginTop: 6, marginBottom: 18, fontFamily: fonts.bold },
  monthCard: { height: 52, borderRadius: 18, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 14 },
  monthText: { color: "#065F46", fontSize: 15, fontFamily: fonts.semibold },
  summaryLine: { flexDirection: "row", marginVertical: 18 },
  summaryItem: { flex: 1, minHeight: 61, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  summarySelected: { backgroundColor: "rgba(6,95,70,0.08)" },
  summaryValue: { color: "#13241E", fontSize: 21, fontFamily: fonts.semibold },
  summaryLabel: { color: "#97A39D", fontSize: 10.5, marginTop: 2, fontFamily: fonts.medium },
  attendanceCard: { borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.11, shadowRadius: 18 },
  attendanceHeader: { height: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(236,248,242,0.76)" },
  attendanceHeaderDay: { width: 61, color: "#173B31", fontSize: 10.5, fontFamily: fonts.semibold },
  attendanceHeaderCell: { flex: 1, color: "#173B31", fontSize: 10.5, textAlign: "left", fontFamily: fonts.semibold },
  attendanceHeaderHours: { textAlign: "right", paddingRight: 17 },
  attendanceRow: { minHeight: 80, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(6,95,70,0.07)" },
  attendanceMain: { flexDirection: "row", alignItems: "center" },
  attendanceTimes: { flex: 1, flexDirection: "row", alignItems: "center" },
  attendanceHoursWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 1 },
  dayBox: { width: 51, height: 54, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  dayNumber: { color: "#13241E", fontSize: 18, fontFamily: fonts.semibold },
  dayName: { color: "#97A39D", fontSize: 8.5, fontFamily: fonts.medium },
  timeColumn: { width: 48 },
  timeLabel: { color: "#97A39D", fontSize: 9.5, fontFamily: fonts.medium },
  rowTime: { flex: 1, color: "#263A33", fontSize: 11.5, fontFamily: fonts.semibold },
  rowTimeMissing: { color: "#A0AAA5" },
  rowTimeOk: { color: "#168563", textAlign: "right" },
  attendanceNoteOk: { marginLeft: 61, marginTop: -4, color: "#168563", fontSize: 9.5, fontFamily: fonts.semibold },
  attendanceNoteWarn: { marginLeft: 61, marginTop: -4, color: "#C07815", fontSize: 9.5, fontFamily: fonts.semibold },
  rowStatusWarn: { marginLeft: "auto", color: "#B67212", fontSize: 10.5, fontFamily: fonts.semibold },
  rowStatusOk: { marginLeft: "auto", color: "#15803D", fontSize: 10.5, fontFamily: fonts.semibold },
  explainCard: { minHeight: 73, borderRadius: 18, padding: 13, marginBottom: 13, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#F5E5BB" },
  explainCopy: { flex: 1 },
  explainTitle: { color: "#3E3A25", fontSize: 12.5, fontFamily: fonts.semibold },
  explainSub: { color: "#8B7B52", fontSize: 10, marginTop: 3, fontFamily: fonts.regular },
  smallPrimary: { minHeight: 36, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#087355" },
  smallPrimaryText: { color: "#FFFFFF", fontSize: 10.5, fontFamily: fonts.semibold },
  segment: { height: 46, borderRadius: 22, padding: 4, marginBottom: 18, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(236,248,242,0.46)", borderWidth: 1, borderColor: "rgba(255,255,255,0.84)", overflow: "hidden" },
  segmentKnob: { position: "absolute", top: 4, bottom: 4, left: 4, width: "49%", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.95)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  segmentButton: { flex: 1, height: 38, alignItems: "center", justifyContent: "center", zIndex: 2 },
  segmentActive: { flex: 1, height: 38, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)" },
  segmentInactive: { flex: 1, height: 38, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  segmentActiveText: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  segmentText: { color: "#65736D", textAlign: "center", fontSize: 12.5, fontFamily: fonts.medium },
  requestRow: { minHeight: 78, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  requestIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ECF8F2" },
  requestCopy: { flex: 1 },
  requestTitle: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  requestDetail: { color: "#77837D", fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  approvalList: { gap: 12 },
  approvalCard: { borderRadius: 20, padding: 14, backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
  approvalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  approvalAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#E6F5ED" },
  approvalDetailAvatar: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", backgroundColor: "#087355", borderWidth: 4, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 14, elevation: 4 },
  approvalAvatarText: { color: "#087355", fontSize: 10, fontFamily: fonts.bold },
  approvalReason: { color: "#65736D", fontSize: 10.5, lineHeight: 16, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: "rgba(6,95,70,0.07)", fontFamily: fonts.regular },
  approvalActions: { flexDirection: "row", gap: 9, marginTop: 12 },
  rejectSmall: { flex: 1, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FFD5D8" },
  rejectSmallText: { color: "#C53E48", fontSize: 10.5, fontFamily: fonts.semibold },
  approveSmall: { flex: 1, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#087355" },
  approveSmallText: { color: "#FFFFFF", fontSize: 10.5, fontFamily: fonts.semibold },
  filterRow: { gap: 8, paddingBottom: 14 },
  filterChip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(6,95,70,0.11)" },
  filterChipActive: { backgroundColor: "#087355", borderColor: "#087355" },
  filterChipText: { color: "#68766F", fontSize: 11, fontFamily: fonts.medium },
  filterChipTextActive: { color: "#FFFFFF", fontFamily: fonts.semibold },
  emptyCard: { minHeight: 190, borderRadius: 22, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: "#FFFFFF" },
  emptyTitle: { color: "#20362F", fontSize: 15, marginTop: 12, fontFamily: fonts.semibold },
  emptyText: { color: "#7A8781", fontSize: 11, lineHeight: 17, marginTop: 5, textAlign: "center", fontFamily: fonts.regular },
  newsList: { gap: 12 },
  newsListCard: { minHeight: 96, borderRadius: 20, padding: 14, flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)" },
  newsListImportant: { backgroundColor: "rgba(255,243,244,0.84)", borderColor: "#FFDADC" },
  newsListIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(236,248,242,0.95)" },
  newsListMeta: { color: "#97A39D", fontSize: 10.5, fontFamily: fonts.medium },
  newsListTitle: { color: "#13241E", fontSize: 13.5, lineHeight: 19, fontFamily: fonts.semibold },
  detailHeader: { height: 61, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.18)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.45)" },
  detailBack: { width: 42, height: 42, borderRadius: 21, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.38)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)" },
  detailTitle: { color: "#173B31", fontSize: 16, fontFamily: fonts.semibold },
  detailSpacer: { width: 42 },
  flowContent: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 112 },
  flowFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 20 : 14, backgroundColor: "rgba(255,255,255,0.94)", borderTopWidth: 1, borderTopColor: "rgba(6,95,70,0.08)" },
  primaryButton: { minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#087355", shadowColor: "#064632", shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: fonts.semibold },
  leaveBalance: { borderRadius: 24, padding: 18, marginBottom: 16, shadowColor: "#064632", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  leaveBalanceHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  leaveBalanceCaption: { color: "#DDF9EC", fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.semibold },
  leaveBalanceUpdate: { color: "rgba(255,255,255,0.65)", fontSize: 9.5, fontFamily: fonts.regular },
  leaveBalanceMain: { flexDirection: "row", alignItems: "baseline", marginTop: 14 },
  leaveBalanceNumber: { color: "#FFFFFF", fontSize: 40, fontFamily: fonts.light },
  leaveBalanceUnit: { color: "#FFFFFF", fontSize: 12, marginLeft: 7, fontFamily: fonts.medium },
  leaveBalanceTotal: { marginLeft: "auto", color: "#DDF9EC", fontSize: 10.5, fontFamily: fonts.medium },
  leaveMeter: { height: 6, borderRadius: 3, marginTop: 13, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  leaveMeterFill: { height: 6, borderRadius: 3, backgroundColor: "#A7F3D0" },
  leaveMeterText: { color: "rgba(255,255,255,0.72)", fontSize: 9.5, marginTop: 7, fontFamily: fonts.regular },
  leaveStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 17 },
  leaveStatValue: { color: "#FFFFFF", fontSize: 16, textAlign: "center", fontFamily: fonts.semibold },
  leaveStatLabel: { color: "rgba(255,255,255,0.62)", fontSize: 8.5, marginTop: 2, fontFamily: fonts.medium },
  advanceHero: { borderRadius: 24, padding: 19, minHeight: 174, justifyContent: "space-between", shadowColor: "#064632", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  advanceAmount: { color: "#FFFFFF", fontSize: 35, marginTop: 15, fontFamily: fonts.light },
  advanceCaption: { color: "rgba(255,255,255,0.7)", fontSize: 10.5, marginTop: 4, fontFamily: fonts.medium },
  advanceMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, paddingTop: 13, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.16)" },
  advanceMetaText: { color: "#DDF9EC", fontSize: 9.5, fontFamily: fonts.semibold },
  infoNote: { minHeight: 62, borderRadius: 17, padding: 13, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EDF8F3", borderWidth: 1, borderColor: "#D8EEE4" },
  infoNoteText: { flex: 1, color: "#51675E", fontSize: 10.5, lineHeight: 16, fontFamily: fonts.regular },
  flowSectionTitle: { marginTop: 21, marginBottom: 11 },
  fieldLabel: { color: "#243C34", fontSize: 12.5, marginTop: 17, marginBottom: 9, fontFamily: fonts.semibold },
  dateStrip: { gap: 8, paddingBottom: 3 },
  dateCell: { width: 51, height: 66, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(6,95,70,0.1)" },
  dateCellOff: { opacity: 0.38 },
  dateCellActive: { backgroundColor: "#087355", borderColor: "#087355" },
  dateWeekday: { color: "#8B9892", fontSize: 9, fontFamily: fonts.medium },
  dateNumber: { color: "#20362F", fontSize: 17, marginTop: 4, fontFamily: fonts.semibold },
  dateActiveText: { color: "#FFFFFF" },
  choiceSegment: { minHeight: 48, borderRadius: 20, padding: 4, flexDirection: "row", backgroundColor: "rgba(232,246,239,0.9)" },
  choiceItem: { flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  choiceItemActive: { backgroundColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  choiceText: { color: "#75827C", fontSize: 10.5, fontFamily: fonts.medium },
  choiceTextActive: { color: "#173B31", fontFamily: fonts.semibold },
  textArea: { minHeight: 104, borderRadius: 18, padding: 14, color: "#20362F", fontSize: 12, lineHeight: 18, textAlignVertical: "top", backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(6,95,70,0.11)", fontFamily: fonts.regular },
  inputError: { borderColor: "#D54C55" },
  reviewCard: { borderRadius: 20, paddingHorizontal: 15, marginTop: 18, backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 16 },
  infoLine: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12 },
  infoLineLabel: { flex: 1, color: "#6D7973", fontSize: 11, fontFamily: fonts.medium },
  infoLineValue: { maxWidth: "58%", color: "#20362F", fontSize: 11, textAlign: "right", fontFamily: fonts.semibold },
  warningNote: { minHeight: 69, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#F5E5BB" },
  warningTitle: { color: "#4B4126", fontSize: 12, fontFamily: fonts.semibold },
  warningText: { color: "#8B7B52", fontSize: 10, marginTop: 3, fontFamily: fonts.regular },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeProposal: { height: 56, borderRadius: 18, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "rgba(6,95,70,0.1)" },
  timeStep: { width: 40, height: 40, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#EDF8F3" },
  timeStepText: { color: "#087355", fontSize: 22, fontFamily: fonts.medium },
  timeProposalValue: { color: "#173B31", fontSize: 20, fontFamily: fonts.semibold },
  errorText: { color: "#C53E48", fontSize: 10, marginTop: 7, fontFamily: fonts.medium },
  uploadButton: { minHeight: 52, borderRadius: 17, paddingHorizontal: 14, marginTop: 15, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#EDF8F3", borderWidth: 1, borderStyle: "dashed", borderColor: "#9DCBBA" },
  uploadText: { color: "#087355", fontSize: 10.5, fontFamily: fonts.medium },
  requestHero: { alignItems: "center", paddingVertical: 12 },
  requestHeroIcon: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F7EF" },
  requestHeroType: { color: "#75827C", fontSize: 11, marginTop: 10, fontFamily: fonts.medium },
  requestHeroTitle: { color: "#173B31", fontSize: 17, lineHeight: 24, marginTop: 4, textAlign: "center", fontFamily: fonts.bold },
  detailStatusWarn: { color: "#A66A0B", fontSize: 10.5, marginTop: 8, fontFamily: fonts.semibold },
  detailStatusOk: { color: "#15803D", fontSize: 10.5, marginTop: 8, fontFamily: fonts.semibold },
  detailStatusMuted: { color: "#7A8781", fontSize: 10.5, marginTop: 8, fontFamily: fonts.semibold },
  timelineCard: { borderRadius: 20, padding: 18, marginTop: 14, backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
  timelineRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 12 },
  timelineDotDone: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#168563" },
  timelineDotCurrent: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0BF", borderWidth: 1, borderColor: "#E6CB71" },
  timelineStem: { width: 2, height: 25, marginLeft: 12, backgroundColor: "#CDE5DA" },
  timelineTitle: { color: "#20362F", fontSize: 11.5, fontFamily: fonts.semibold },
  timelineSub: { color: "#89958F", fontSize: 9.5, marginTop: 2, fontFamily: fonts.regular },
  dangerButton: { minHeight: 50, borderRadius: 17, marginTop: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FFD5D8" },
  dangerButtonText: { color: "#C53E48", fontSize: 12, fontFamily: fonts.semibold },
  doneScreen: { flex: 1, paddingHorizontal: 28, alignItems: "stretch", justifyContent: "center" },
  doneIcon: { width: 86, height: 86, borderRadius: 43, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#168563", shadowColor: "#064632", shadowOpacity: 0.25, shadowRadius: 18, elevation: 5 },
  doneTitle: { color: "#173B31", fontSize: 21, marginTop: 22, textAlign: "center", fontFamily: fonts.bold },
  doneText: { color: "#6D7973", fontSize: 12, lineHeight: 19, marginTop: 8, marginBottom: 25, textAlign: "center", fontFamily: fonts.regular },
  linkButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  linkButtonText: { color: "#087355", fontSize: 12, fontFamily: fonts.semibold },
  centerCaption: { color: "#7A8781", fontSize: 11, marginTop: 8, textAlign: "center", fontFamily: fonts.medium },
  moneyHero: { color: "#173B31", fontSize: 30, marginTop: 7, textAlign: "center", fontFamily: fonts.light },
  centerHint: { color: "#8B9892", fontSize: 10, marginTop: 5, textAlign: "center", fontFamily: fonts.regular },
  amountBox: { height: 72, borderRadius: 21, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(6,95,70,0.11)" },
  amountValue: { color: "#173B31", fontSize: 27, fontFamily: fonts.semibold },
  amountCurrency: { color: "#65736D", fontSize: 16, fontFamily: fonts.medium },
  eyeToggle: { alignSelf: "flex-end", minHeight: 34, paddingHorizontal: 10, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EDF8F3" },
  eyeToggleText: { color: "#087355", fontSize: 9.5, fontFamily: fonts.semibold },
  profileHero: { alignItems: "center", paddingVertical: 12 },
  profileContent: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 52 },
  profileCard: { alignItems: "center", padding: 10, paddingBottom: 18, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.62)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  profileCover: { width: "100%", height: 124, borderRadius: 20, overflow: "hidden" },
  profileSun: { position: "absolute", width: 30, height: 30, borderRadius: 15, right: 52, top: 20, backgroundColor: "#FFF4D6" },
  profileHill: { position: "absolute", width: 120, height: 180, borderRadius: 60, top: 18, backgroundColor: "rgba(46,156,119,0.5)" },
  profileHillLeft: { left: -78, transform: [{ rotate: "-12deg" }] },
  profileHillRight: { right: -80, transform: [{ rotate: "12deg" }] },
  profileWave: { position: "absolute", width: 430, height: 130, borderRadius: 215, left: -48 },
  profileWaveBack: { top: 67, backgroundColor: "#A7F3D0", transform: [{ rotate: "-3deg" }] },
  profileWaveFront: { top: 93, backgroundColor: "#21B886", transform: [{ rotate: "2deg" }] },
  profileAvatarOverlap: { marginTop: -54 },
  profileAvatarLarge: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#087355", borderWidth: 5, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.28, shadowRadius: 16, elevation: 5 },
  profileAvatarLargeText: { color: "#FFFFFF", fontSize: 28, fontFamily: fonts.bold },
  profileVerifiedName: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 11 },
  profileCardName: { color: "#173B31", fontSize: 21, fontFamily: fonts.bold },
  profileCardRole: { color: "#7A8781", fontSize: 11.5, marginTop: 3, fontFamily: fonts.medium },
  profileStats: { width: "100%", flexDirection: "row", marginTop: 17, marginBottom: 15 },
  profileStat: { flex: 1, alignItems: "center", gap: 3 },
  profileStatBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(6,95,70,0.11)" },
  profileStatValue: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileStatNumber: { color: "#173B31", fontSize: 15, fontFamily: fonts.bold },
  profileStatLabel: { color: "#8B9892", fontSize: 10, fontFamily: fonts.medium },
  profileEditButton: { width: "96%" },
  profileSectionTitle: { marginTop: 22, marginBottom: 11 },
  profileSectionHeader: { marginTop: 22, marginBottom: 11, paddingHorizontal: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileActionsCard: { marginTop: 18, borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 3 },
  profileAction: { minHeight: 57, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(6,95,70,0.07)" },
  profileActionText: { flex: 1, color: "#263A33", fontSize: 12.5, fontFamily: fonts.semibold },
  profileActionDanger: { color: "#C53E48" },
  sheetLayer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,40,30,0.16)" },
  sheetScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  profileSheet: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 34, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: "rgba(250,253,251,0.98)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.22, shadowRadius: 24, elevation: 12 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, alignSelf: "center", backgroundColor: "#D4DED9" },
  sheetTitle: { color: "#173B31", fontSize: 19, marginTop: 17, textAlign: "center", fontFamily: fonts.bold },
  sheetSubtitle: { color: "#7A8781", fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 4, textAlign: "center", fontFamily: fonts.regular },
  pinSheet: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: "rgba(250,253,251,0.98)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.22, shadowRadius: 24, elevation: 12 },
  pinDots: { flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 24 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#D8E2DD" },
  pinDotActive: { backgroundColor: "#087355", borderColor: "#087355", transform: [{ scale: 1.12 }] },
  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  keypadKey: { width: "30%", height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  keypadPlain: { width: "30%", height: 52, alignItems: "center", justifyContent: "center" },
  keypadPressed: { transform: [{ scale: 0.95 }], backgroundColor: "#E7F7EF" },
  keypadText: { color: "#173B31", fontSize: 20, fontFamily: fonts.medium },
  profileAvatar: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#087355", borderWidth: 4, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 14, elevation: 4 },
  profileAvatarText: { color: "#FFFFFF", fontSize: 23, fontFamily: fonts.bold },
  profileName: { color: "#173B31", fontSize: 19, marginTop: 11, fontFamily: fonts.bold },
  profileRole: { color: "#7A8781", fontSize: 10.5, marginTop: 4, fontFamily: fonts.medium },
  deviceHero: { minHeight: 92, borderRadius: 22, padding: 15, flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  deviceIntro: { alignItems: "center", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
  deviceIllustration: { width: 104, height: 104, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F7EF", borderWidth: 1, borderColor: "#D4EEE2" },
  deviceIntroTitle: { color: "#173B31", fontSize: 18, lineHeight: 24, marginTop: 17, textAlign: "center", fontFamily: fonts.bold },
  deviceIntroText: { color: "#7A8781", fontSize: 11.5, lineHeight: 18, marginTop: 7, textAlign: "center", fontFamily: fonts.regular },
  devicePhone: { width: 58, height: 66, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F7F0" },
  deviceName: { color: "#173B31", fontSize: 13, fontFamily: fonts.semibold },
  deviceStatus: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  deviceStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#18A578" },
  deviceStatusText: { color: "#168563", fontSize: 9.5, fontFamily: fonts.semibold },
  disabledButton: { minHeight: 50, borderRadius: 17, marginTop: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#E7EFEB", borderWidth: 1, borderColor: "#D7E2DC" },
  disabledButtonText: { color: "#85918B", fontSize: 12, fontFamily: fonts.semibold },
  inlineInput: { minWidth: 145, height: 38, borderRadius: 12, paddingHorizontal: 10, color: "#20362F", textAlign: "right", backgroundColor: "#F1F8F5", borderWidth: 1, borderColor: "#B9D9CB", fontSize: 11, fontFamily: fonts.semibold },
  readAll: { alignSelf: "flex-end", minHeight: 37, justifyContent: "center", marginBottom: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15936D" },
  articleContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 54 },
  newsDetailHero: { minHeight: 224, borderRadius: 24, padding: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(217,71,79,0.13)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 3 },
  newsHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  newsCategory: { minHeight: 29, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.74)", borderWidth: 1, borderColor: "rgba(6,95,70,0.08)" },
  newsCategoryText: { color: "#087355", fontSize: 10.5, fontFamily: fonts.bold },
  newsHeroIcon: { width: 48, height: 48, borderRadius: 16, alignSelf: "flex-end", marginTop: 7, marginBottom: -13, marginRight: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.76)", transform: [{ rotate: "4deg" }] },
  newsHeroTitle: { color: "#173B31", fontSize: 20.5, lineHeight: 25, marginTop: 12, fontFamily: fonts.bold },
  newsByline: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 10 },
  newsByAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#087355" },
  newsByAvatarText: { color: "#FFFFFF", fontSize: 9.5, fontFamily: fonts.bold },
  newsByName: { color: "#173B31", fontSize: 11.5, fontFamily: fonts.bold },
  newsByMeta: { color: "#7A8781", fontSize: 10.5, marginTop: 1, fontFamily: fonts.regular },
  newsCallout: { minHeight: 82, borderRadius: 22, padding: 14, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF2F1", borderWidth: 1, borderColor: "rgba(217,71,79,0.14)" },
  newsCalloutIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  newsCalloutTitle: { color: "#3B2A2B", fontSize: 12.5, fontFamily: fonts.bold },
  newsCalloutText: { color: "#765D5F", fontSize: 10.5, lineHeight: 16, marginTop: 3, fontFamily: fonts.regular },
  newsBodyCard: { padding: 18, borderRadius: 24, marginTop: 14, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 16, elevation: 2 },
  newsBodyHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  newsBodyHeadingText: { color: "#087355", fontSize: 10.5, letterSpacing: 1, fontFamily: fonts.bold },
  newsFile: { minHeight: 66, borderRadius: 19, padding: 11, marginTop: 15, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8FAF9", borderWidth: 1, borderColor: "#E5ECE8" },
  newsActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  newsActionButton: { flex: 1, minHeight: 46, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
  newsActionText: { color: "#173B31", fontSize: 11.5, fontFamily: fonts.semibold },
  articleCover: { height: 188, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF5E9", borderWidth: 1, borderColor: "#CBE9DB" },
  articleMeta: { color: "#B44B53", fontSize: 9.5, letterSpacing: 0.8, marginTop: 20, fontFamily: fonts.semibold },
  articleTitle: { color: "#173B31", fontSize: 20, lineHeight: 27, marginTop: 8, fontFamily: fonts.bold },
  articleLead: { color: "#3E564D", fontSize: 12.5, lineHeight: 20, marginTop: 13, fontFamily: fonts.semibold },
  articleBody: { color: "#66766F", fontSize: 12, lineHeight: 20, marginTop: 13, fontFamily: fonts.regular },
  widgetWall: { borderRadius: 28, padding: 18, overflow: "hidden", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 18, elevation: 4 },
  widgetPreview: { height: 188, borderRadius: 28, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  widgetBrand: { color: "#A7F3D0", fontSize: 9, letterSpacing: 2, fontFamily: fonts.bold },
  widgetTime: { color: "#FFFFFF", fontSize: 38, marginTop: 7, fontFamily: fonts.light },
  widgetShift: { color: "rgba(255,255,255,0.66)", fontSize: 9.5, marginTop: 1, fontFamily: fonts.medium },
  widgetAction: { minWidth: 108, height: 36, borderRadius: 18, marginTop: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A7F3D0" },
  widgetActionText: { color: "#064E3B", fontSize: 10.5, fontFamily: fonts.bold },
  authScene: { flex: 1, overflow: "hidden", backgroundColor: "rgba(249,251,250,0.94)" },
  authOrb: { position: "absolute", borderRadius: 999, borderWidth: 1, borderColor: "rgba(6,95,70,0.06)" },
  authOrbTop: { width: 520, height: 250, left: -260, top: 16, transform: [{ rotate: "-22deg" }], backgroundColor: "rgba(167,243,208,0.12)" },
  authOrbBottom: { width: 430, height: 210, right: -248, bottom: 48, transform: [{ rotate: "18deg" }], backgroundColor: "rgba(255,224,169,0.14)" },
  loginScreen: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 25, paddingBottom: 20 },
  authBrandCard: { width: 164, height: 82, borderRadius: 30, alignSelf: "center", marginTop: 10, marginBottom: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(230,246,239,0.9)", shadowColor: "#065F46", shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  authWordmark: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  authWordmarkText: { color: "#065F46", fontSize: 25, lineHeight: 30, letterSpacing: -0.8, fontFamily: fonts.bold },
  authHeading: { alignItems: "center", marginBottom: 16 },
  loginTitle: { color: "#123024", fontSize: 31, lineHeight: 36, textAlign: "center", fontFamily: fonts.bold },
  loginSubtitle: { maxWidth: 300, color: "#5D6B65", fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: "center", fontFamily: fonts.regular },
  authForm: { gap: 12 },
  authField: { minHeight: 64, borderRadius: 32, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.48)", borderWidth: 1, borderColor: "rgba(19,36,30,0.07)", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  authFieldInput: { flex: 1, minWidth: 0, paddingVertical: 0, color: "#13241E", fontSize: 14, fontFamily: fonts.medium },
  authPasswordWrap: { flex: 1, height: 36, justifyContent: "center" },
  authPasswordHiddenInput: { opacity: 0 },
  authPasswordDots: { position: "absolute", left: 0, color: "#13241E", fontSize: 18, letterSpacing: 2.2, fontFamily: fonts.bold },
  authEye: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  authForgot: { alignSelf: "flex-end", minHeight: 24, paddingHorizontal: 4, justifyContent: "center" },
  authForgotText: { color: "#5D6B65", fontSize: 12.5, fontFamily: fonts.semibold },
  authSubmitRow: { height: 60, flexDirection: "row", gap: 10 },
  authPrimary: { height: 60, borderRadius: 30, overflow: "hidden", shadowColor: "#065F46", shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  authPrimaryGrow: { flex: 1 },
  authPrimaryBlock: { width: "100%" },
  authPrimaryDisabled: { opacity: 0.42 },
  authPrimaryGradient: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.26)", borderRadius: 30 },
  faceLogin: { width: 60, height: 60, borderRadius: 22, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.48)", borderWidth: 1, borderColor: "rgba(6,95,70,0.2)", shadowColor: "#065F46", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  loginDivider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#E3EAE6" },
  dividerText: { color: "#97A39D", fontSize: 12, fontFamily: fonts.medium },
  ssoButton: { height: 56, borderRadius: 28, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.30)", borderWidth: 1, borderColor: "#C9D0CC" },
  ssoIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F6EF" },
  ssoText: { color: "#263A33", fontSize: 13.5, fontFamily: fonts.semibold },
  loginInput: { height: 50, borderRadius: 16, paddingHorizontal: 14, color: "#20362F", backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(6,95,70,0.12)", fontSize: 12, fontFamily: fonts.medium },
  authFootRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: "auto", paddingTop: 18 },
  authFootText: { color: "#5D6B65", fontSize: 12.5, fontFamily: fonts.regular },
  authActivate: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.bold },
  authBack: { position: "absolute", top: 11, left: 18, zIndex: 4, width: 42, height: 42, borderRadius: 21, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.32)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  authProgress: { position: "absolute", top: 30, left: 0, right: 0, zIndex: 3, flexDirection: "row", justifyContent: "center", gap: 8 },
  authProgressBar: { width: 34, height: 4, borderRadius: 2, backgroundColor: "rgba(19,36,30,0.12)" },
  authProgressBarActive: { backgroundColor: "#0B8966" },
  authFlowScreen: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 62, paddingBottom: 20 },
  authFlowOtp: { paddingTop: 82 },
  authSubtitleStrong: { color: "#173B31", fontFamily: fonts.semibold },
  resetNote: { minHeight: 62, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(221,245,233,0.62)", borderWidth: 1, borderColor: "rgba(6,95,70,0.08)" },
  resetNoteText: { flex: 1, color: "#496158", fontSize: 11, lineHeight: 17, fontFamily: fonts.regular },
  authAgree: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 3, paddingVertical: 3 },
  authCheckbox: { width: 20, height: 20, borderRadius: 7, marginTop: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#AAB5B0", backgroundColor: "rgba(255,255,255,0.7)" },
  authCheckboxOn: { borderColor: "#087355", backgroundColor: "#087355" },
  authAgreeText: { flex: 1, color: "#66766F", fontSize: 11, lineHeight: 17, fontFamily: fonts.regular },
  authAgreeLink: { color: "#087355", fontFamily: fonts.semibold },
  otpResend: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 18 },
  passwordRules: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 2 },
  passwordRule: { color: "#66766F", fontSize: 9.5, lineHeight: 15, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(221,245,233,0.64)", fontFamily: fonts.medium },
  authFieldError: { borderColor: "rgba(200,71,80,0.46)" },
  authContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 45 },
  authIcon: { width: 70, height: 70, borderRadius: 24, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#E8F7F0", borderWidth: 1, borderColor: "#D5EEE3" },
  authTitle: { color: "#173B31", fontSize: 22, marginTop: 24, textAlign: "center", fontFamily: fonts.bold },
  authSubtitle: { color: "#7A8781", fontSize: 11.5, lineHeight: 18, marginTop: 8, marginBottom: 16, textAlign: "center", fontFamily: fonts.regular },
  otpBoxes: { flexDirection: "row", justifyContent: "space-between", gap: 7, marginTop: 22, marginBottom: 14 },
  otpBox: { flex: 1, maxWidth: 48, height: 54, borderRadius: 15, padding: 0, textAlign: "center", backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#D8E5DF" },
  otpBoxFilled: { borderColor: "#46AF8B", backgroundColor: "#EFFAF5" },
  otpDigit: { color: "#173B31", fontSize: 18, fontFamily: fonts.semibold },
  otpInput: { width: 1, height: 1, opacity: 0, alignSelf: "center" },
  quickScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.24)" },
  quickMenu: { position: "absolute", right: 23, bottom: 111, zIndex: 31, gap: 11, alignItems: "flex-end" },
  quickItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  quickLabel: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 15, overflow: "hidden", alignItems: "flex-end", backgroundColor: "rgba(255,255,255,0.36)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#064632", shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  quickLabelText: { color: "#13241E", fontSize: 12, fontFamily: fonts.semibold },
  quickLabelSub: { color: "#7A8781", fontSize: 9.5, marginTop: 2, fontFamily: fonts.regular },
  quickCircle: { width: 51, height: 51, borderRadius: 26, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.36)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#064632", shadowOpacity: 0.16, shadowRadius: 13, elevation: 4 },
  dock: { position: "absolute", left: 18, right: 18, zIndex: 30, height: 64, flexDirection: "row", alignItems: "center", gap: 11 },
  dockPill: { flex: 1, height: 64, paddingHorizontal: 7, borderRadius: 32, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#064632", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  dockPillDim: { opacity: 0.25 },
  dockItem: { height: 48, minWidth: 45, paddingHorizontal: 11, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dockItemContent: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dockItemActive: { backgroundColor: "rgba(6,95,70,0.10)" },
  dockLabel: { color: "#13241E", fontSize: 10.5, marginLeft: 6, fontFamily: fonts.semibold },
  fabWrap: { width: 64, height: 64, borderRadius: 32 },
  fab: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.34)", shadowColor: "#065F46", shadowOpacity: 0.42, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  toast: { position: "absolute", left: 32, right: 32, bottom: 102, zIndex: 50, minHeight: 45, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  toastText: { flexShrink: 1, color: "#20362F", fontSize: 11, textAlign: "center", fontFamily: fonts.semibold },
});
