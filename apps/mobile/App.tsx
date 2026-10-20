import { useState, type ComponentProps } from "react";
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SAMPLE_TENANT } from "@kavor/contracts";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type TabId = "home" | "attendance" | "requests" | "news";
type FlowId = "leave" | "leaveNew" | "explain" | "ot" | "advance" | "payslips" | "profile" | "notifications" | "widget" | "newsDetail" | "requestDetail" | "done" | "login";
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

const quickCreate: Array<{ label: string; icon: IconName }> = [
  { label: "Tạo đơn nghỉ", icon: "airplane" },
  { label: "Giải trình công", icon: "clock-edit-outline" },
  { label: "Đăng ký làm thêm", icon: "weather-night" },
];

function AppIcon({ name, size = 22, color = "#065F46" }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function DecorativeBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["rgba(167,243,208,0.72)", "rgba(167,243,208,0)"]} style={[styles.blob, styles.blobTop]} />
      <LinearGradient colors={["rgba(16,185,129,0.22)", "rgba(16,185,129,0)"]} style={[styles.blob, styles.blobRight]} />
      <LinearGradient colors={["rgba(110,231,183,0.38)", "rgba(110,231,183,0)"]} style={[styles.blob, styles.blobBottom]} />
    </View>
  );
}

function HomeHeader({ onNotice, onProfile }: { onNotice: () => void; onProfile?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Thông báo" style={styles.circleButton} onPress={onNotice}>
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

function NewsCarousel({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={styles.newsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bản tin mới</Text>
        <Text style={styles.sectionLink}>Tất cả</Text>
      </View>
      <Pressable style={styles.newsCard} onPress={onOpen}>
        <View style={styles.newsIcon}><AppIcon name="message-text-outline" size={23} color="#C84750" /></View>
        <View style={styles.newsCopy}>
          <View style={styles.newsMeta}>
            <View style={styles.importantTag}><AppIcon name="alert-outline" size={11} color="#FFFFFF" /><Text style={styles.importantText}>Quan trọng</Text></View>
            <Text style={styles.newsDate}>Hôm qua</Text>
          </View>
          <Text style={styles.newsTitle}>Chấm công GPS trên app Kavor áp dụng từ 01/11/2026</Text>
        </View>
      </Pressable>
      <View style={styles.carouselDots}><View style={styles.carouselDotActive} /><View style={styles.carouselDot} /><View style={styles.carouselDot} /><View style={styles.carouselDot} /></View>
    </View>
  );
}

function PunchHero({ checkedIn, onPunch, onTap }: { checkedIn: boolean; onPunch: () => void; onTap: () => void }) {
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
        <View style={styles.haloOuter} />
        <View style={styles.haloInner} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={checkedIn ? "Ra ca" : "Vào ca"}
          delayLongPress={850}
          onPress={onTap}
          onLongPress={onPunch}
          style={({ pressed }) => [styles.punchPressable, pressed && styles.punchPressed]}
        >
          <LinearGradient colors={checkedIn ? ["#D6FBEA", "#A7F3D0", "#84E5BA"] : ["#199B74", "#065F46", "#044E39"]} style={styles.punchOrb}>
            <AppIcon name={checkedIn ? "gesture-tap-hold" : "gesture-tap-hold"} size={53} color={checkedIn ? "#065F46" : "#FFFFFF"} />
            <Text style={[styles.punchTitle, checkedIn && styles.punchTitleOut]}>{checkedIn ? "RA CA" : "VÀO CA"}</Text>
            <Text style={[styles.punchHint, checkedIn && styles.punchTitleOut]}>Nhấn giữ 1 giây</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.locationRow}><AppIcon name="map-marker-outline" size={19} color="#1D3B32" /><Text style={styles.locationText}>Vị trí: Văn phòng Quận 1</Text></View>
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
      <Pressable style={styles.noticeCard} onPress={() => notify("Đã mở giải trình công mẫu") }>
        <View style={styles.noticeIcon}><AppIcon name="clock-alert-outline" size={25} color="#B67212" /></View>
        <View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Hạn giải trình công: 22/10</Text><Text style={styles.noticeDetail}>Ngày 15/10 thiếu giờ vào · còn 6 ngày</Text></View>
        <Text style={styles.noticeLimit}>2/3 lượt</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, styles.personalTitle]}>Của bạn</Text>
      <View style={styles.listCard}>
        <PersonalRow icon="airplane" title="Phép năm còn lại" value="6,5 ngày" />
        <PersonalRow icon="cash-multiple" title="Hạn mức tạm ứng" value="4.500.000 ₫" border />
        <PersonalRow icon="receipt-text-outline" title="Phiếu lương 09/2026" value="Đã công bố" border />
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

function PersonalRow({ icon, title, value, border = false }: { icon: IconName; title: string; value: string; border?: boolean }) {
  return (
    <View style={[styles.personalRow, border && styles.personalRowBorder]}>
      <AppIcon name={icon} size={23} color="#087355" />
      <Text style={styles.personalLabel}>{title}</Text>
      <Text style={styles.personalValue}>{value}</Text>
      <AppIcon name="chevron-right" size={18} color="#9AA69F" />
    </View>
  );
}

function HomeScreen({ checkedIn, notify, onPunch, openFlow }: { checkedIn: boolean; notify: (message: string) => void; onPunch: () => void; openFlow: (flow: FlowId) => void }) {
  return (
    <>
      <HomeHeader onNotice={() => openFlow("notifications")} onProfile={() => openFlow("profile")} />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <NewsCarousel onOpen={() => openFlow("newsDetail")} />
        <PunchHero checkedIn={checkedIn} onPunch={onPunch} onTap={() => notify("Nhấn giữ nút tròn trong 1 giây để chấm công")} />
        <PersonalSection notify={notify} openFlow={openFlow} />
      </ScrollView>
    </>
  );
}

const attendanceRows: Array<[string, string, string, string, string]> = [
  ["16", "Thứ Sáu", "--:--", "17:06", "Thiếu giờ vào"],
  ["15", "Thứ Năm", "08:07", "17:12", "Muộn 7 phút"],
  ["14", "Thứ Tư", "07:56", "17:04", "Đủ công"],
];

function SecondaryScreen({
  tab,
  notify,
  requests,
  onOpenRequest,
  onOpenExplain,
  onOpenNews,
}: {
  tab: Exclude<TabId, "home">;
  notify: (message: string) => void;
  requests: RequestItem[];
  onOpenRequest: (id: string) => void;
  onOpenExplain: () => void;
  onOpenNews: () => void;
}) {
  const titles = { attendance: "Bảng công", requests: "Đơn từ", news: "Bản tin" };
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "late" | "missing">("all");
  const [requestFilter, setRequestFilter] = useState<"all" | RequestStatus>("all");
  const [requestScope, setRequestScope] = useState<"mine" | "approve">("mine");
  const [approvals, setApprovals] = useState<RequestItem[]>([
    { id: "NP-2410", kind: "leave", title: "Võ Thảo Linh", detail: "Nghỉ phép · 24/10 · 1 ngày", status: "pending", created: "16/10 · 07:42", reason: "Việc gia đình" },
    { id: "GT-1610", kind: "explain", title: "Đặng Văn Khoa", detail: "Giải trình · thiếu giờ vào", status: "pending", created: "16/10 · 06:58", reason: "Đi công tác tại xưởng" },
  ]);
  const visibleAttendance = attendanceRows.filter((row) => attendanceFilter === "all" || (attendanceFilter === "late" ? row[4].includes("Muộn") : row[4].includes("Thiếu")));
  const visibleRequests = requests.filter((item) => requestFilter === "all" || item.status === requestFilter);
  return (
    <>
      <HomeHeader onNotice={() => notify("Mở Thông báo từ Trang chủ")} />
      <ScrollView contentContainerStyle={styles.secondaryContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>{titles[tab]}</Text>
        {tab === "attendance" ? (
          <>
            <View style={styles.monthCard}><Pressable><AppIcon name="chevron-left" color="#97A39D" /></Pressable><Text style={styles.monthText}>Tháng 10, 2026</Text><Pressable><AppIcon name="chevron-right" color="#97A39D" /></Pressable></View>
            <View style={styles.summaryLine}>
              <Pressable style={[styles.summaryItem, attendanceFilter === "all" && styles.summarySelected]} onPress={() => setAttendanceFilter("all")}><Summary value="10/22" label="Ngày công" /></Pressable>
              <Pressable style={[styles.summaryItem, attendanceFilter === "late" && styles.summarySelected]} onPress={() => setAttendanceFilter("late")}><Summary value="2" label="Đi muộn" /></Pressable>
              <Pressable style={[styles.summaryItem, attendanceFilter === "missing" && styles.summarySelected]} onPress={() => setAttendanceFilter("missing")}><Summary value="1" label="Thiếu công" /></Pressable>
            </View>
            {attendanceFilter !== "all" ? <View style={styles.explainCard}><View style={styles.explainCopy}><Text style={styles.explainTitle}>Còn 2/3 lượt giải trình</Text><Text style={styles.explainSub}>Hạn 22/10, trước ngày chốt công</Text></View><Pressable style={styles.smallPrimary} onPress={onOpenExplain}><Text style={styles.smallPrimaryText}>Tạo giải trình</Text></Pressable></View> : null}
            <View style={styles.attendanceCard}>{visibleAttendance.map((row) => <Pressable style={styles.attendanceRow} key={row[0]} onPress={row[4] === "Đủ công" ? () => notify("Ngày công này không có bất thường") : onOpenExplain}><View style={styles.dayBox}><Text style={styles.dayNumber}>{row[0]}</Text><Text style={styles.dayName}>{row[1]}</Text></View><View style={styles.timeColumn}><Text style={styles.timeLabel}>Vào</Text><Text style={styles.rowTime}>{row[2]}</Text></View><View style={styles.timeColumn}><Text style={styles.timeLabel}>Ra</Text><Text style={styles.rowTime}>{row[3]}</Text></View><Text style={row[4] === "Đủ công" ? styles.rowStatusOk : styles.rowStatusWarn}>{row[4]}</Text></Pressable>)}</View>
          </>
        ) : tab === "requests" ? (
          <>
            <View style={styles.segment}><Pressable style={requestScope === "mine" ? styles.segmentActive : styles.segmentInactive} onPress={() => setRequestScope("mine")}><Text style={requestScope === "mine" ? styles.segmentActiveText : styles.segmentText}>Đơn của tôi</Text></Pressable><Pressable style={requestScope === "approve" ? styles.segmentActive : styles.segmentInactive} onPress={() => setRequestScope("approve")}><Text style={requestScope === "approve" ? styles.segmentActiveText : styles.segmentText}>Cần tôi duyệt · {approvals.length}</Text></Pressable></View>
            {requestScope === "mine" ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{([['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['cancelled', 'Đã hủy']] as const).map(([id, label]) => <Pressable key={id} style={[styles.filterChip, requestFilter === id && styles.filterChipActive]} onPress={() => setRequestFilter(id)}><Text style={[styles.filterChipText, requestFilter === id && styles.filterChipTextActive]}>{label}</Text></Pressable>)}</ScrollView>{visibleRequests.length ? <View style={styles.listCard}>{visibleRequests.map((item, index) => <RequestRow key={item.id} icon={requestIcon[item.kind]} title={item.title} detail={item.detail} status={requestStatusLabel[item.status]} border={index > 0} onPress={() => onOpenRequest(item.id)} />)}</View> : <View style={styles.emptyCard}><AppIcon name="file-document-check-outline" size={42} color="#8AA097" /><Text style={styles.emptyTitle}>Không có đơn nào</Text><Text style={styles.emptyText}>Đổi bộ lọc hoặc bấm nút + để tạo đơn mới.</Text></View>}</> : approvals.length ? <View style={styles.approvalList}>{approvals.map((item) => <View key={item.id} style={styles.approvalCard}><View style={styles.approvalHeader}><View style={styles.approvalAvatar}><Text style={styles.approvalAvatarText}>{item.title.split(" ").map((part) => part[0]).slice(-2).join("")}</Text></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>{item.title}</Text><Text style={styles.requestDetail}>{item.detail}</Text></View><Text style={styles.rowStatusWarn}>Chờ bạn</Text></View><Text style={styles.approvalReason}>{item.reason}</Text><View style={styles.approvalActions}><Pressable style={styles.rejectSmall} onPress={() => { setApprovals((current) => current.filter((row) => row.id !== item.id)); notify(`Đã từ chối ${item.id}`); }}><Text style={styles.rejectSmallText}>Từ chối</Text></Pressable><Pressable style={styles.approveSmall} onPress={() => { setApprovals((current) => current.filter((row) => row.id !== item.id)); notify(`Đã duyệt ${item.id}`); }}><Text style={styles.approveSmallText}>Duyệt</Text></Pressable></View></View>)}</View> : <View style={styles.emptyCard}><AppIcon name="check-all" size={42} color="#168563" /><Text style={styles.emptyTitle}>Không còn đơn cần duyệt</Text><Text style={styles.emptyText}>Đơn mới từ nhóm sẽ xuất hiện tại đây.</Text></View>}
          </>
        ) : (
          <View style={styles.newsList}><NewsListCard important title="Chấm công GPS trên app Kavor áp dụng từ 01/11/2026" meta="Thông báo · Hôm qua" onPress={onOpenNews} /><NewsListCard title="Lịch nghỉ và trực hỗ trợ cuối tháng 10" meta="Chính sách · 15/10/2026" onPress={onOpenNews} /><NewsListCard title="Chúc mừng sinh nhật nhân viên tháng 10" meta="Sự kiện · 10/10/2026" onPress={onOpenNews} /></View>
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
  return <View style={styles.detailHeader}><Pressable accessibilityLabel="Quay lại" style={styles.detailBack} onPress={onBack}><AppIcon name="arrow-left" size={22} color="#173B31" /></Pressable><Text style={styles.detailTitle}>{title}</Text><View style={styles.detailSpacer} /></View>;
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

function AdvanceScreen({ onBack, onSubmit }: { onBack: () => void; onSubmit: (request: RequestItem) => void }) {
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

function ProfileScreen({ onBack, notify, onLogout }: { onBack: () => void; notify: (message: string) => void; onLogout: () => void }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("0901 234 567");
  return <>
    <DetailHeader title="Hồ sơ của tôi" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHero}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>TH</Text></View><Text style={styles.profileName}>Trần Thu Hà</Text><Text style={styles.profileRole}>Marketing Executive · HD0142</Text></View>
      <Text style={styles.fieldLabel}>Thông tin liên hệ</Text><View style={styles.reviewCard}><InfoLine label="Email công việc" value="ha@haidang.vn" />{editing ? <View style={[styles.infoLine, styles.personalRowBorder]}><Text style={styles.infoLineLabel}>Điện thoại</Text><TextInput accessibilityLabel="Điện thoại" value={phone} onChangeText={setPhone} style={styles.inlineInput} /></View> : <InfoLine label="Điện thoại" value={phone} border />}<InfoLine label="Địa chỉ" value="Quận Bình Thạnh, TP.HCM" border /></View>
      <Text style={styles.fieldLabel}>Công việc</Text><View style={styles.reviewCard}><InfoLine label="Phòng ban" value="Marketing" /><InfoLine label="Quản lý" value="Lê Quang Huy" border /><InfoLine label="Ngày vào làm" value="12/03/2023" border /></View>
      <Pressable style={styles.primaryButton} onPress={() => { if (editing) notify("Đã gửi yêu cầu cập nhật hồ sơ cho HR"); setEditing((value) => !value); }}><Text style={styles.primaryButtonText}>{editing ? "Gửi HR phê duyệt" : "Đề nghị sửa thông tin"}</Text></Pressable>
      <Pressable style={styles.linkButton} onPress={() => notify("Thiết bị hiện tại: iPhone · hoạt động")}><Text style={styles.linkButtonText}>Quản lý thiết bị đăng nhập</Text></Pressable>
      <Pressable style={styles.dangerButton} onPress={onLogout}><Text style={styles.dangerButtonText}>Đăng xuất tài khoản demo</Text></Pressable>
    </ScrollView>
  </>;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("ha@haidang.vn");
  const [password, setPassword] = useState("12345678");
  return <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled"><View style={styles.loginMark}><Text style={styles.loginMarkText}>K</Text></View><Text style={styles.loginTitle}>Chào mừng trở lại</Text><Text style={styles.loginSubtitle}>Đăng nhập vào không gian Hải Đăng Group</Text><Pressable style={styles.googleButton} onPress={onLogin}><Text style={styles.googleLetter}>G</Text><Text style={styles.googleText}>Tiếp tục với Google</Text></Pressable><View style={styles.loginDivider}><View /><Text>hoặc</Text><View /></View><Text style={styles.fieldLabel}>Email công việc</Text><TextInput accessibilityLabel="Email công việc" autoCapitalize="none" value={email} onChangeText={setEmail} style={styles.loginInput} /><Text style={styles.fieldLabel}>Mật khẩu</Text><TextInput accessibilityLabel="Mật khẩu" secureTextEntry value={password} onChangeText={setPassword} style={styles.loginInput} /><Pressable style={[styles.primaryButton, { marginTop: 20 }]} onPress={onLogin}><Text style={styles.primaryButtonText}>Đăng nhập</Text></Pressable><Pressable style={styles.linkButton}><Text style={styles.linkButtonText}>Quên mật khẩu?</Text></Pressable><Text style={styles.loginFoot}>Đăng nhập demo · không gửi dữ liệu ra bên ngoài</Text></ScrollView>;
}

function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [readAll, setReadAll] = useState(false);
  const items = [["Đơn nghỉ NP-2310 đang chờ duyệt", "5 phút trước", "file-clock-outline"], ["Kỳ công tháng 10 chốt sau 6 ngày", "1 giờ trước", "clock-alert-outline"], ["Phiếu lương 09/2026 đã công bố", "05/10", "receipt-text-outline"]] as const;
  return <><DetailHeader title="Thông báo" onBack={onBack} /><ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}><Pressable style={styles.readAll} onPress={() => setReadAll(true)}><Text style={styles.linkButtonText}>{readAll ? "Đã đọc tất cả" : "Đánh dấu tất cả đã đọc"}</Text></Pressable><View style={styles.listCard}>{items.map((item, index) => <View key={item[0]} style={[styles.requestRow, index > 0 && styles.personalRowBorder]}><View style={styles.requestIcon}><AppIcon name={item[2]} size={23} /></View><View style={styles.requestCopy}><Text style={styles.requestTitle}>{item[0]}</Text><Text style={styles.requestDetail}>{item[1]}</Text></View>{!readAll && index < 2 ? <View style={styles.unreadDot} /> : null}</View>)}</View></ScrollView></>;
}

function NewsDetailScreen({ onBack }: { onBack: () => void }) {
  return <><DetailHeader title="Bản tin" onBack={onBack} /><ScrollView contentContainerStyle={styles.articleContent} showsVerticalScrollIndicator={false}><View style={styles.articleCover}><AppIcon name="map-marker-radius-outline" size={55} color="#087355" /></View><Text style={styles.articleMeta}>QUAN TRỌNG · PHÒNG NHÂN SỰ · 19/10/2026</Text><Text style={styles.articleTitle}>Chấm công GPS trên app Kavor áp dụng từ 01/11/2026</Text><Text style={styles.articleLead}>Từ ngày 01/11, toàn bộ nhân viên sẽ thực hiện chấm công vào và ra ca trực tiếp trên ứng dụng Kavor.</Text><Text style={styles.articleBody}>Ứng dụng chỉ ghi nhận vị trí tại thời điểm bạn chủ động chấm công. Kavor không theo dõi vị trí liên tục trong ngày.{"\n\n"}Khi ở trong bán kính văn phòng, nhấn giữ nút chấm công trong một giây. Nếu mạng yếu, bản ghi được lưu an toàn và tự động gửi lại khi có kết nối.{"\n\n"}Nếu thiếu bản ghi, hãy tạo giải trình trước ngày 22 hằng tháng để quản lý và HR xử lý trước khi chốt công.</Text><View style={styles.infoNote}><AppIcon name="shield-check-outline" size={20} color="#087355" /><Text style={styles.infoNoteText}>Vị trí chấm công được bảo vệ theo chính sách dữ liệu của Hải Đăng Group.</Text></View></ScrollView></>;
}

function WidgetGuideScreen({ onBack, notify }: { onBack: () => void; notify: (message: string) => void }) {
  return <><DetailHeader title="Widget chấm công" onBack={onBack} /><ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}><View style={styles.widgetPreview}><Text style={styles.widgetBrand}>KAVOR</Text><Text style={styles.widgetTime}>07:58</Text><Text style={styles.widgetShift}>Ca hành chính · 08:00–17:00</Text><View style={styles.widgetAction}><Text style={styles.widgetActionText}>VÀO CA</Text></View></View><Text style={styles.articleTitle}>Chấm công nhanh từ màn hình chính</Text><Text style={styles.articleBody}>Thêm widget Kavor để xem ca làm, trạng thái hôm nay và mở nhanh màn chấm công. Bạn vẫn cần xác nhận trong ứng dụng để tránh thao tác nhầm.</Text><View style={styles.reviewCard}><InfoLine label="iOS" value="Nhấn giữ màn hình → + → Kavor" /><InfoLine label="Android" value="Widgets → Kavor" border /></View><Pressable style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => notify("Đã đánh dấu hướng dẫn hoàn tất")}><Text style={styles.primaryButtonText}>Đã hiểu</Text></Pressable></ScrollView></>;
}

function DoneScreen({ kind, onViewRequests, onHome }: { kind: RequestKind; onViewRequests: () => void; onHome: () => void }) {
  const isLeave = kind === "leave";
  const title = isLeave ? "Đã gửi đơn nghỉ" : kind === "ot" ? "Đã gửi đăng ký OT" : kind === "advance" ? "Đã gửi đề nghị tạm ứng" : "Đã gửi yêu cầu giải trình";
  const detail = isLeave ? "Ngày phép đã được giữ chỗ đến khi đơn được duyệt." : kind === "ot" ? "Quản lý sẽ nhận thông báo để duyệt thời gian làm thêm." : kind === "advance" ? "Đề nghị sẽ lần lượt qua Quản lý, HR và Kế toán." : "Lê Quang Huy sẽ nhận thông báo để duyệt yêu cầu.";
  return <View style={styles.doneScreen}><View style={styles.doneIcon}><AppIcon name="check" size={45} color="#FFFFFF" /></View><Text style={styles.doneTitle}>{title}</Text><Text style={styles.doneText}>{detail}</Text><Pressable style={styles.primaryButton} onPress={onViewRequests}><Text style={styles.primaryButtonText}>Xem đơn của tôi</Text></Pressable><Pressable style={styles.linkButton} onPress={onHome}><Text style={styles.linkButtonText}>Về trang chủ</Text></Pressable></View>;
}

function Dock({ activeTab, setActiveTab, quickOpen, setQuickOpen, openFlow, notify }: { activeTab: TabId; setActiveTab: (tab: TabId) => void; quickOpen: boolean; setQuickOpen: (open: boolean) => void; openFlow: (flow: FlowId) => void; notify: (message: string) => void }) {
  function runQuickAction(label: string) {
    setQuickOpen(false);
    if (label === "Tạo đơn nghỉ") openFlow("leaveNew");
    else if (label === "Giải trình công") openFlow("explain");
    else if (label === "Đăng ký làm thêm") openFlow("ot");
    else notify("Tác vụ đang được cập nhật");
  }
  return (
    <>
      {quickOpen ? <Pressable style={styles.quickScrim} onPress={() => setQuickOpen(false)} /> : null}
      {quickOpen ? <View style={styles.quickMenu}>{quickCreate.map((item) => <Pressable style={styles.quickItem} key={item.label} onPress={() => runQuickAction(item.label)}><View style={styles.quickLabel}><Text style={styles.quickLabelText}>{item.label}</Text><Text style={styles.quickLabelSub}>Tạo mới bằng dữ liệu mẫu</Text></View><View style={styles.quickCircle}><AppIcon name={item.icon} size={24} /></View></Pressable>)}</View> : null}
      <View style={styles.dock}>
        <View style={styles.dockPill}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={tab.id} style={[styles.dockItem, active && styles.dockItemActive]} onPress={() => setActiveTab(tab.id)}><AppIcon name={active ? tab.activeIcon : tab.icon} size={23} color={active ? "#065F46" : "#6D7973"} />{active ? <Text style={styles.dockLabel}>{tab.label}</Text> : null}</Pressable>;
          })}
        </View>
        <Pressable accessibilityLabel="Tạo nhanh" style={({ pressed }) => [styles.fabWrap, pressed && styles.punchPressed]} onPress={() => setQuickOpen(!quickOpen)}>
          <LinearGradient colors={["#15936D", "#065F46", "#044E39"]} style={styles.fab}>
            <AppIcon name={quickOpen ? "close" : "plus"} size={30} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Montserrat_300Light, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold });
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [signedIn, setSignedIn] = useState(true);
  const [flow, setFlow] = useState<FlowId | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>(initialRequests);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [doneKind, setDoneKind] = useState<RequestKind>("leave");

  function notify(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 2200);
  }

  function openFlow(nextFlow: FlowId) {
    setQuickOpen(false);
    setFlow(nextFlow);
  }

  function openRequest(id: string) {
    setSelectedRequestId(id);
    openFlow("requestDetail");
  }

  function submitRequest(request: RequestItem) {
    setRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
    setDoneKind(request.kind);
    setFlow("done");
  }

  const selectedRequest = requests.find((item) => item.id === selectedRequestId);

  if (!fontsLoaded) return <View style={styles.loading} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <DecorativeBackground />
        {!signedIn ? <LoginScreen onLogin={() => { setSignedIn(true); setFlow(null); notify("Đăng nhập thành công"); }} />
          : flow === "leave" ? <LeaveOverview requests={requests} onBack={() => setFlow(null)} onCreate={() => setFlow("leaveNew")} onOpenRequest={openRequest} />
          : flow === "leaveNew" ? <LeaveForm onBack={() => setFlow("leave")} onSubmit={submitRequest} />
          : flow === "explain" ? <ExplainForm onBack={() => setFlow(null)} onSubmit={submitRequest} />
          : flow === "ot" ? <OtForm onBack={() => setFlow(null)} onSubmit={submitRequest} />
          : flow === "advance" ? <AdvanceScreen onBack={() => setFlow(null)} onSubmit={submitRequest} />
          : flow === "payslips" ? <PayslipsScreen onBack={() => setFlow(null)} notify={notify} />
          : flow === "profile" ? <ProfileScreen onBack={() => setFlow(null)} notify={notify} onLogout={() => { setSignedIn(false); setFlow(null); }} />
          : flow === "notifications" ? <NotificationsScreen onBack={() => setFlow(null)} />
          : flow === "newsDetail" ? <NewsDetailScreen onBack={() => setFlow(null)} />
          : flow === "widget" ? <WidgetGuideScreen onBack={() => setFlow(null)} notify={notify} />
          : flow === "requestDetail" && selectedRequest ? <RequestDetail item={selectedRequest} onBack={() => setFlow(null)} onCancel={() => { setRequests((current) => current.map((item) => item.id === selectedRequest.id ? { ...item, status: "cancelled" } : item)); notify(`Đã hủy đơn ${selectedRequest.id}`); setFlow(null); }} />
          : flow === "done" ? <DoneScreen kind={doneKind} onViewRequests={() => { setActiveTab("requests"); setFlow(null); }} onHome={() => { setActiveTab("home"); setFlow(null); }} />
          : activeTab === "home" ? <HomeScreen checkedIn={checkedIn} notify={notify} openFlow={openFlow} onPunch={() => { setCheckedIn((value) => !value); notify(checkedIn ? "Đã ghi nhận ra ca" : "Đã ghi nhận vào ca lúc 07:58"); }} />
          : <SecondaryScreen tab={activeTab} notify={notify} requests={requests} onOpenRequest={openRequest} onOpenExplain={() => openFlow("explain")} onOpenNews={() => openFlow("newsDetail")} />}
        {signedIn && !flow ? <Dock activeTab={activeTab} setActiveTab={(tab) => { setQuickOpen(false); setActiveTab(tab); }} quickOpen={quickOpen} setQuickOpen={setQuickOpen} openFlow={openFlow} notify={notify} /> : null}
        {message ? <View style={styles.toast}><Text style={styles.toastText}>{message}</Text></View> : null}
      </View>
    </SafeAreaView>
  );
}

const fonts = { regular: "Montserrat_400Regular", medium: "Montserrat_500Medium", semibold: "Montserrat_600SemiBold", bold: "Montserrat_700Bold", light: "Montserrat_300Light" } as const;

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#FFFFFF" },
  safeArea: { flex: 1, backgroundColor: "#FFFFFF", paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0 },
  app: { flex: 1, backgroundColor: "#FFFFFF", overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 999 },
  blobTop: { width: 370, height: 370, top: -170, left: -165 },
  blobRight: { width: 310, height: 310, top: 285, right: -185 },
  blobBottom: { width: 340, height: 340, bottom: -185, left: -90 },
  header: { height: 61, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 3 },
  circleButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", shadowColor: "#064632", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  notificationDot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: "#D9474F", borderWidth: 2, borderColor: "#FFFFFF" },
  companyName: { flex: 1, textAlign: "center", color: "#20362F", fontSize: 14, letterSpacing: 2.2, fontFamily: fonts.regular },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#197E60", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 9, elevation: 3 },
  avatarText: { color: "#FFFFFF", fontSize: 12, fontFamily: fonts.semibold },
  homeContent: { paddingHorizontal: 20, paddingBottom: 150 },
  newsSection: { marginTop: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  sectionTitle: { color: "#13241E", fontSize: 16, fontFamily: fonts.bold },
  sectionLink: { color: "#065F46", fontSize: 12.5, fontFamily: fonts.semibold },
  newsCard: { minHeight: 91, borderRadius: 20, padding: 14, flexDirection: "row", gap: 12, backgroundColor: "rgba(255,243,244,0.82)", borderWidth: 1, borderColor: "rgba(255,214,216,0.95)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
  newsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFECEE", alignItems: "center", justifyContent: "center" },
  newsCopy: { flex: 1, gap: 5 },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  importantTag: { height: 20, paddingHorizontal: 7, borderRadius: 8, backgroundColor: "#D24E57", flexDirection: "row", alignItems: "center", gap: 3 },
  importantText: { color: "#FFFFFF", fontSize: 10, fontFamily: fonts.bold },
  newsDate: { color: "#97A39D", fontSize: 11, fontFamily: fonts.medium },
  newsTitle: { color: "#13241E", fontSize: 14, lineHeight: 19, fontFamily: fonts.semibold },
  carouselDots: { height: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#DCE2DF" },
  carouselDotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: "#065F46" },
  hero: { alignItems: "center", marginTop: -1 },
  heroTime: { color: "#1D3B32", fontSize: 52, lineHeight: 58, letterSpacing: -1.4, fontFamily: fonts.light },
  heroDate: { color: "#7A8781", fontSize: 17, marginTop: 2, fontFamily: fonts.regular },
  shiftChip: { minHeight: 30, marginTop: 8, paddingHorizontal: 12, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.08, shadowRadius: 10 },
  shiftText: { color: "#5D6B65", fontSize: 12, fontFamily: fonts.medium },
  punchStage: { width: "100%", height: 226, marginTop: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mapSquare: { position: "absolute", width: 22, height: 22, borderRadius: 5, backgroundColor: "rgba(222,247,235,0.78)" },
  crossLineA: { position: "absolute", width: 460, height: 44, backgroundColor: "rgba(255,255,255,0.65)", transform: [{ rotate: "31deg" }] },
  crossLineB: { position: "absolute", width: 430, height: 38, backgroundColor: "rgba(255,255,255,0.58)", transform: [{ rotate: "-56deg" }] },
  haloOuter: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "rgba(167,243,208,0.19)" },
  haloInner: { position: "absolute", width: 184, height: 184, borderRadius: 92, backgroundColor: "rgba(255,255,255,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 2 },
  punchPressable: { width: 160, height: 160, borderRadius: 80, zIndex: 2 },
  punchPressed: { transform: [{ scale: 0.96 }], opacity: 0.92 },
  punchOrb: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", shadowColor: "#064632", shadowOpacity: 0.42, shadowRadius: 22, shadowOffset: { width: 0, height: 13 }, elevation: 9 },
  punchTitle: { color: "#FFFFFF", fontSize: 15, letterSpacing: 0.7, marginTop: 2, fontFamily: fonts.semibold },
  punchTitleOut: { color: "#065F46" },
  punchHint: { color: "rgba(255,255,255,0.82)", fontSize: 10, marginTop: 1, fontFamily: fonts.medium },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: -2 },
  locationText: { color: "#1D3B32", fontSize: 13.5, fontFamily: fonts.medium },
  heroStats: { width: "100%", flexDirection: "row", marginTop: 18 },
  heroStat: { flex: 1, alignItems: "center", gap: 3 },
  heroStatValue: { color: "#13241E", fontSize: 18, marginTop: 1, fontFamily: fonts.bold },
  heroStatLabel: { color: "#97A39D", fontSize: 11.5, fontFamily: fonts.medium },
  noticeCard: { minHeight: 76, borderRadius: 20, padding: 13, marginTop: 22, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  noticeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF4DC", alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  noticeDetail: { color: "#68766F", fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  noticeLimit: { color: "#B67212", fontSize: 11.5, fontFamily: fonts.semibold },
  personalTitle: { marginTop: 22, marginBottom: 11 },
  listCard: { borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.12, shadowRadius: 18, elevation: 3 },
  personalRow: { minHeight: 59, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 11 },
  personalRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(6,95,70,0.08)" },
  personalLabel: { flex: 1, color: "#263A33", fontSize: 12.5, fontFamily: fonts.semibold },
  personalValue: { color: "#263A33", fontSize: 11.5, fontFamily: fonts.semibold },
  shortcutsCard: { borderRadius: 22, paddingVertical: 18, paddingHorizontal: 8, marginTop: 18, flexDirection: "row", flexWrap: "wrap", backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.1, shadowRadius: 16 },
  shortcut: { width: "25%", minHeight: 65, alignItems: "center", justifyContent: "center", gap: 8 },
  shortcutLabel: { color: "#5D6B65", fontSize: 10.5, textAlign: "center", fontFamily: fonts.medium },
  secondaryContent: { paddingHorizontal: 20, paddingBottom: 150 },
  screenTitle: { color: "#13241E", fontSize: 22, marginTop: 6, marginBottom: 18, fontFamily: fonts.bold },
  monthCard: { height: 52, borderRadius: 18, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
  monthText: { color: "#065F46", fontSize: 15, fontFamily: fonts.semibold },
  summaryLine: { flexDirection: "row", marginVertical: 18 },
  summaryItem: { flex: 1, minHeight: 61, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  summarySelected: { backgroundColor: "rgba(6,95,70,0.08)" },
  summaryValue: { color: "#13241E", fontSize: 21, fontFamily: fonts.semibold },
  summaryLabel: { color: "#97A39D", fontSize: 10.5, marginTop: 2, fontFamily: fonts.medium },
  attendanceCard: { borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "#FFFFFF" },
  attendanceRow: { minHeight: 76, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(6,95,70,0.07)" },
  dayBox: { width: 51, height: 54, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  dayNumber: { color: "#13241E", fontSize: 18, fontFamily: fonts.semibold },
  dayName: { color: "#97A39D", fontSize: 8.5, fontFamily: fonts.medium },
  timeColumn: { width: 48 },
  timeLabel: { color: "#97A39D", fontSize: 9.5, fontFamily: fonts.medium },
  rowTime: { color: "#263A33", fontSize: 11.5, marginTop: 3, fontFamily: fonts.semibold },
  rowStatusWarn: { marginLeft: "auto", color: "#B67212", fontSize: 10.5, fontFamily: fonts.semibold },
  rowStatusOk: { marginLeft: "auto", color: "#15803D", fontSize: 10.5, fontFamily: fonts.semibold },
  explainCard: { minHeight: 73, borderRadius: 18, padding: 13, marginBottom: 13, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#F5E5BB" },
  explainCopy: { flex: 1 },
  explainTitle: { color: "#3E3A25", fontSize: 12.5, fontFamily: fonts.semibold },
  explainSub: { color: "#8B7B52", fontSize: 10, marginTop: 3, fontFamily: fonts.regular },
  smallPrimary: { minHeight: 36, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#087355" },
  smallPrimaryText: { color: "#FFFFFF", fontSize: 10.5, fontFamily: fonts.semibold },
  segment: { height: 46, borderRadius: 22, padding: 4, marginBottom: 18, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(236,248,242,0.88)" },
  segmentActive: { flex: 1, height: 38, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)" },
  segmentInactive: { flex: 1, height: 38, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  segmentActiveText: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  segmentText: { flex: 1, color: "#65736D", textAlign: "center", fontSize: 12.5, fontFamily: fonts.medium },
  requestRow: { minHeight: 78, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  requestIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ECF8F2" },
  requestCopy: { flex: 1 },
  requestTitle: { color: "#13241E", fontSize: 12.5, fontFamily: fonts.semibold },
  requestDetail: { color: "#77837D", fontSize: 10.5, marginTop: 3, fontFamily: fonts.regular },
  approvalList: { gap: 12 },
  approvalCard: { borderRadius: 20, padding: 14, backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
  approvalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  approvalAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#E6F5ED" },
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
  newsListCard: { minHeight: 96, borderRadius: 20, padding: 14, flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "#FFFFFF" },
  newsListImportant: { backgroundColor: "rgba(255,243,244,0.84)", borderColor: "#FFDADC" },
  newsListIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(236,248,242,0.95)" },
  newsListMeta: { color: "#97A39D", fontSize: 10.5, fontFamily: fonts.medium },
  newsListTitle: { color: "#13241E", fontSize: 13.5, lineHeight: 19, fontFamily: fonts.semibold },
  detailHeader: { height: 61, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 3 },
  detailBack: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#FFFFFF" },
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
  reviewCard: { borderRadius: 20, paddingHorizontal: 15, marginTop: 18, backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#FFFFFF" },
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
  profileAvatar: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#087355", borderWidth: 4, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 14, elevation: 4 },
  profileAvatarText: { color: "#FFFFFF", fontSize: 23, fontFamily: fonts.bold },
  profileName: { color: "#173B31", fontSize: 19, marginTop: 11, fontFamily: fonts.bold },
  profileRole: { color: "#7A8781", fontSize: 10.5, marginTop: 4, fontFamily: fonts.medium },
  inlineInput: { minWidth: 145, height: 38, borderRadius: 12, paddingHorizontal: 10, color: "#20362F", textAlign: "right", backgroundColor: "#F1F8F5", borderWidth: 1, borderColor: "#B9D9CB", fontSize: 11, fontFamily: fonts.semibold },
  readAll: { alignSelf: "flex-end", minHeight: 37, justifyContent: "center", marginBottom: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15936D" },
  articleContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 54 },
  articleCover: { height: 188, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF5E9", borderWidth: 1, borderColor: "#CBE9DB" },
  articleMeta: { color: "#B44B53", fontSize: 9.5, letterSpacing: 0.8, marginTop: 20, fontFamily: fonts.semibold },
  articleTitle: { color: "#173B31", fontSize: 20, lineHeight: 27, marginTop: 8, fontFamily: fonts.bold },
  articleLead: { color: "#3E564D", fontSize: 12.5, lineHeight: 20, marginTop: 13, fontFamily: fonts.semibold },
  articleBody: { color: "#66766F", fontSize: 12, lineHeight: 20, marginTop: 13, fontFamily: fonts.regular },
  widgetPreview: { height: 188, borderRadius: 28, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#173B31", shadowColor: "#064632", shadowOpacity: 0.25, shadowRadius: 18, elevation: 5 },
  widgetBrand: { color: "#A7F3D0", fontSize: 9, letterSpacing: 2, fontFamily: fonts.bold },
  widgetTime: { color: "#FFFFFF", fontSize: 38, marginTop: 7, fontFamily: fonts.light },
  widgetShift: { color: "rgba(255,255,255,0.66)", fontSize: 9.5, marginTop: 1, fontFamily: fonts.medium },
  widgetAction: { minWidth: 108, height: 36, borderRadius: 18, marginTop: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A7F3D0" },
  widgetActionText: { color: "#064E3B", fontSize: 10.5, fontFamily: fonts.bold },
  loginScreen: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 75, paddingBottom: 35 },
  loginMark: { width: 58, height: 58, borderRadius: 18, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#087355", transform: [{ rotate: "-6deg" }], shadowColor: "#064632", shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 },
  loginMarkText: { color: "#FFFFFF", fontSize: 27, fontFamily: fonts.bold },
  loginTitle: { color: "#173B31", fontSize: 24, marginTop: 27, textAlign: "center", fontFamily: fonts.bold },
  loginSubtitle: { color: "#7A8781", fontSize: 11.5, lineHeight: 18, marginTop: 7, marginBottom: 24, textAlign: "center", fontFamily: fonts.regular },
  googleButton: { height: 52, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE5E1" },
  googleLetter: { color: "#4285F4", fontSize: 18, fontFamily: fonts.bold },
  googleText: { color: "#263A33", fontSize: 12, fontFamily: fonts.semibold },
  loginDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 19 },
  loginInput: { height: 50, borderRadius: 16, paddingHorizontal: 14, color: "#20362F", backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(6,95,70,0.12)", fontSize: 12, fontFamily: fonts.medium },
  loginFoot: { color: "#98A49E", fontSize: 9.5, marginTop: 24, textAlign: "center", fontFamily: fonts.regular },
  quickScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, backgroundColor: "rgba(255,255,255,0.76)" },
  quickMenu: { position: "absolute", right: 23, bottom: 111, zIndex: 31, gap: 11, alignItems: "flex-end" },
  quickItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  quickLabel: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 15, alignItems: "flex-end", backgroundColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  quickLabelText: { color: "#13241E", fontSize: 12, fontFamily: fonts.semibold },
  quickLabelSub: { color: "#7A8781", fontSize: 9.5, marginTop: 2, fontFamily: fonts.regular },
  quickCircle: { width: 51, height: 51, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.16, shadowRadius: 13, elevation: 4 },
  dock: { position: "absolute", left: 18, right: 18, bottom: Platform.OS === "ios" ? 18 : 14, zIndex: 30, height: 64, flexDirection: "row", alignItems: "center", gap: 11 },
  dockPill: { flex: 1, height: 64, paddingHorizontal: 7, borderRadius: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  dockItem: { height: 48, minWidth: 45, paddingHorizontal: 11, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dockItemActive: { backgroundColor: "rgba(6,95,70,0.10)" },
  dockLabel: { color: "#13241E", fontSize: 10.5, marginLeft: 6, fontFamily: fonts.semibold },
  fabWrap: { width: 64, height: 64, borderRadius: 32 },
  fab: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.34)", shadowColor: "#065F46", shadowOpacity: 0.42, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  toast: { position: "absolute", left: 32, right: 32, bottom: 102, zIndex: 50, minHeight: 45, borderRadius: 16, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#FFFFFF", shadowColor: "#064632", shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  toastText: { color: "#20362F", fontSize: 11, textAlign: "center", fontFamily: fonts.semibold },
});
