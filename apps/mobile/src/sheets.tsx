import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { C, F, glass, tint } from "./theme";
import { FaceId, Gi, Ic } from "./icons";
import { Illus } from "./illus";
import { Appear } from "./motion";
import { Btn, BtnRow, Chip, Chips, ErrLine, Field, Inp, Ln, Note, SecT, T, TextArea } from "./ui";
import { WDF, dur, gh, hm, hms, pad, wdOct } from "./data";
import { ACT, ADV_DAY, S, WD_ISO_FULL, closeSheet, day, dayInfo, ddmm, emit, explainLeft, fmtM, go, issueText, shiftLabel, shiftTime, simNow, tsDay, verdict, type SheetKind } from "./store";
import { REMOTE } from "./api/http";

const H3 = ({ children, center }: { children: ReactNode; center?: boolean }) => <T style={{ fontSize: 19, fontFamily: F.bold, textAlign: center ? "center" : "left" }}>{children}</T>;
const Sub = ({ children, center }: { children: ReactNode; center?: boolean }) => <T style={{ color: C.ink2, marginTop: -10, textAlign: center ? "center" : "left" }}>{children}</T>;
const Muted = ({ children, center }: { children: ReactNode; center?: boolean }) => <T style={{ color: C.ink2, textAlign: center ? "center" : "left" }}>{children}</T>;
const Code = ({ children }: { children: string }) => <T style={{ fontSize: 11.5, color: C.ink3, fontFamily: "Menlo" }}>{children}</T>;
const Center = ({ children, gap = 6 }: { children: ReactNode; gap?: number }) => <View style={{ alignItems: "center", gap }}>{children}</View>;
export const Box = ({ children }: { children: ReactNode }) => <View style={styles.box}>{children}</View>;
const Close = ({ children = "Đóng", kind = "ghost" as const }: { children?: string; kind?: "ghost" | "primary" }) => <Btn kind={kind} block onPress={() => closeSheet()}>{children}</Btn>;

function PinDot({ on }: { on: boolean }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: on ? 1 : 0, speed: 24, bounciness: 10, useNativeDriver: true }).start(); }, [on]);
  return <Animated.View style={[styles.pinDot, on && styles.pinDotOn, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]} />;
}
function Key({ children, onPress, plain, label }: { children: ReactNode; onPress: () => void; plain?: boolean; label?: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.key, plain && styles.keyPlain, pressed && !plain && { backgroundColor: C.soft2, experimental_backgroundImage: undefined, transform: [{ scale: 0.94 }] }, pressed && plain && { opacity: 0.6 }]}>
      {typeof children === "string" ? <T style={{ fontSize: 24, fontFamily: F.medium, lineHeight: 30 }}>{children}</T> : children}
    </Pressable>
  );
}

function FaceRing() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })); a.start(); return () => a.stop(); }, [v]);
  return (
    <View style={{ alignItems: "center", paddingVertical: 16 }}>
      <View style={{ width: 104, height: 104, borderRadius: 30, backgroundColor: C.soft, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ position: "absolute", top: -3, left: -3, width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: "transparent", borderTopColor: C.violet, borderRightColor: C.emerald, transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }} />
        <FaceId size={48} color={C.emerald} />
      </View>
    </View>
  );
}

function CheckRing() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })); a.start(); return () => a.stop(); }, [v]);
  return <Animated.View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: C.soft2, borderTopColor: C.emerald, transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }} />;
}

export function SheetContent({ kind, arg }: { kind: SheetKind; arg?: string }) {
  switch (kind) {
    case "pin": {
      /* Tiêu đề theo bước: nhập PIN / PIN hiện tại (khi đổi) / tạo PIN mới / nhập lại để xác nhận */
      const m = S.pinMode;
      const [title, sub] = m === "create" ? [S.pinChange ? "Mã PIN mới" : "Tạo mã PIN", "6 số để mở lương, tạm ứng và tài liệu"]
        : m === "confirm" ? ["Nhập lại mã PIN", "Nhập lại 6 số vừa chọn để xác nhận"]
        : m === "old" ? ["Nhập mã PIN hiện tại", "Xác nhận trước khi đổi mã PIN"]
        : ["Nhập mã PIN", "Lương và tạm ứng được bảo vệ bằng PIN"];
      const canBio = m === "enter" && !S.pinChange;
      return <>
        <H3 center>{title}</H3>
        <Sub center>{sub}</Sub>
        <View style={{ flexDirection: "row", gap: 16, justifyContent: "center", paddingVertical: 4 }}>{Array.from({ length: 6 }, (_, i) => <PinDot key={i} on={i < S.pin.length} />)}</View>
        {S.pinErr ? <T style={{ color: C.bad, textAlign: "center", fontFamily: F.medium, marginTop: -6 }}>{S.pinErr}</T> : null}
        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <Key key={n} onPress={() => ACT.pinkey(String(n))}>{String(n)}</Key>)}
          {canBio ? <Key plain label="Dùng Face ID" onPress={() => { void ACT.faceid(); }}><FaceId size={30} color={C.emerald} /></Key> : <View style={[styles.key, styles.keyPlain]} />}
          <Key onPress={() => ACT.pinkey("0")}>0</Key>
          <Key plain label="Xóa" onPress={() => ACT.pinkey("del")}><Ic n="chevL" s={24} w={2} color={C.ink2} /></Key>
        </View>
        {m === "enter" || m === "old" ? <Pressable onPress={ACT.forgotPin}><T style={{ color: C.emerald, fontFamily: F.semibold, textAlign: "center" }}>Quên mã PIN?</T></Pressable> : null}
      </>;
    }
    /* Chỉ còn dùng cho trạng thái QA "faceid-scanning" (đối chiếu prototype); app thật gọi thẳng hộp thoại Face ID */
    case "face": return <>
      <H3 center>Face ID</H3>
      <FaceRing />
      <Appear><T style={{ color: C.ink2, textAlign: "center", marginTop: -16 }}>Đang nhận diện…</T></Appear>
    </>;
    case "receipt": {
      const [k, ts = "0"] = (arg ?? "in:0").split(":"); const kind2 = k as "in" | "out"; const t = +ts; const v = verdict(kind2, t);
      return <>
        <Center gap={4}>
          <Illus kind={kind2 === "in" ? "punchIn" : "punchOut"} />
          <T style={{ fontSize: 21, fontFamily: F.bold, textAlign: "center" }}>Đã {kind2 === "in" ? "vào" : "ra"} ca lúc {hm(t)}</T>
          <T style={{ fontSize: 14, fontFamily: F.semibold, color: v[1] === "ok" ? C.ok : C.warn }}>{v[0]}</T>
        </Center>
        {REMOTE && S.att.last
          ? <Box><Ln k="Giờ ghi nhận" v={hms(t)} /><Ln k="Vị trí" v={`${S.att.last.locationName ?? S.att.loc.name}${S.att.last.distanceM != null ? " · " + fmtM(S.att.last.distanceM) : ""}`} /><Ln k="Thiết bị" v={S.att.device} /><Ln k="Mã bản ghi" v={S.att.last.recordCode} /></Box>
          : <Box><Ln k="Giờ ghi nhận" v={hms(t)} /><Ln k="Vị trí" v="VP Quận 1 · 1,8 m" /><Ln k="Thiết bị" v="iPhone 15" /><Ln k="Mã bản ghi" v={"CC-161026-" + (kind2 === "in" ? "0142" : "0143")} /></Box>}
        <Close kind="primary">Xong</Close>
      </>;
    }
    case "queued": {
      const [k, ts = "0"] = (arg ?? "in:0").split(":");
      return <>
        <Center><Illus kind="offline" /><H3 center>Đã lưu {k === "in" ? "vào" : "ra"} ca lúc {hm(+ts)} trên máy</H3>
          <Muted center>Chưa kết nối được máy chủ. Kavor sẽ tự gửi khi có mạng (trong 24 giờ) và máy chủ vẫn kiểm tra vị trí như bình thường.</Muted><Code>E01</Code></Center>
        <Close kind="primary">Đã hiểu</Close>
      </>;
    }
    case "help": {
      const H: Record<string, [string, string]> = {
        clock: ["T01 – T04", "Nhấn giữ nút tròn khoảng 1 giây, vòng viền chạy hết là chấm công xong. Ngoài vùng 3 m thì nút chuyển xám."],
        explain: ["T08", "Giới hạn 3 lượt/tháng. Hạn gửi = ngày chốt công trừ 3 ngày. Hết lượt thì form khóa."],
        leaveNew: ["L03 – L05", "Chọn khoảng ngày trên dải lịch. Hệ thống tự trừ cuối tuần và kiểm tra số dư phép trước khi gửi."],
        advanceNew: ["V03 – V04", "Hạn mức = 30% lương cơ bản. Gõ quá hạn mức để xem lỗi tại chỗ."],
        advance: ["V01 · V05", "Đổi Hợp đồng sang Thử việc hoặc Sắp nghỉ ở bảng bên phải để xem trạng thái bị chặn."],
        widgetGuide: ["Widget", "Widget cỡ vừa có nút chấm công (App Intent, iOS 17+). Cỡ nhỏ chỉ xem trạng thái và mở app."],
      };
      const h = H[arg ?? ""] || [arg ?? "", "Màn hình trong prototype."];
      return <><H3>Ghi chú màn hình</H3><Sub>{h[0]}</Sub><Muted>{h[1]}</Muted><Close /></>;
    }
    case "netSend": return <>
      <Center><Illus kind="offline" /><H3 center>Chưa gửi được</H3><Muted center>Bạn đang ngoại tuyến. Nội dung đã nhập vẫn được giữ, chỉ cần gửi lại khi có mạng.</Muted><Code>E28</Code></Center>
      <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Để sau</Btn><Btn spinKey="retrySend" onPress={ACT.retrySend}>Thử lại</Btn></BtnRow>
    </>;
    case "netPunch": return <>
      <Center><Illus kind="offline" /><H3 center>Chưa ghi nhận chấm công</H3><Muted center>Chấm công cần mạng để máy chủ xác thực giờ và vị trí. Bật Wi-Fi hoặc 4G rồi thử lại.</Muted><Code>E01</Code></Center>
      <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Đóng</Btn><Btn spinKey="retryPunch" onPress={ACT.retryPunch}>Thử lại</Btn></BtnRow>
    </>;
    case "earlyOut": {
      const m = Math.floor(simNow() / 60);
      return <><H3>Ra ca sớm?</H3><Sub>Ca kết thúc lúc {hm(S.sh.end * 60)}. Ra ca bây giờ sẽ ghi nhận về sớm {dur(S.sh.end - m)}.</Sub>
        <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Ở lại</Btn><Btn kind="danger" onPress={ACT.punchGo}>Vẫn ra ca</Btn></BtnRow></>;
    }
    case "slowCheck": return (
      <View style={{ alignItems: "center", gap: 12, paddingTop: 12, paddingBottom: 6 }}>
        <CheckRing /><H3 center>Đang gửi chấm công…</H3>
        <Muted center>Mạng chậm. Ứng dụng đang kiểm tra máy chủ đã nhận bản ghi chưa, bạn không cần bấm lại.</Muted><Code>E26</Code>
      </View>
    );
    case "blocked": return <>
      <Center><Gi n="pin" s={48} w={1.5} /><H3 center>Bạn đang ở ngoài vùng chấm công</H3><Muted center>{REMOTE ? `Vị trí hiện tại cách ${S.att.loc.name} khoảng ${S.att.distM == null ? "?" : fmtM(S.att.distM)}. Vùng hợp lệ là ${S.att.loc.radiusM} m quanh điểm chấm công.` : "Vị trí hiện tại cách Văn phòng Quận 1 khoảng 126 m. Vùng hợp lệ là 3 m quanh điểm chấm công."}</Muted></Center>
      <BtnRow>
        <Btn kind="ghost" icon={<Gi n="refresh" s={18} />} onPress={ACT.relocate}>{S.spin === "relocate" ? "Đang lấy…" : "Lấy lại vị trí"}</Btn>
        <Btn onPress={() => go("explain")}>Giải trình</Btn>
      </BtnRow>
    </>;
    case "day": {
      if (arg?.includes("-")) {
        /* Bảng công thật: giờ gốc, giờ ghi nhận sau điều chỉnh, kết quả công và đơn giải trình của ngày */
        const x = tsDay(arg);
        if (!x) return <><H3>Ngày {ddmm(arg)}</H3><Muted>Ngày này không thuộc kỳ công đang xem.</Muted><Close /></>;
        const req = x.request;
        const result = x.kind === "holiday" ? `Nghỉ lễ${x.holidayName ? ` · ${x.holidayName}` : ""}` : x.kind === "off" ? "Ngày nghỉ" : x.kind === "today" ? "Đang tính"
          : x.kind === "leave" ? `${x.credit ? "1 công" : "0 công"} · ${x.leave?.typeName ?? "nghỉ phép"} theo ${x.leave?.requestNo ?? "đơn"}`
          : `${x.credit ? "1 công" : "0 công"}${x.adjusted && req ? ` · đã điều chỉnh theo ${req.no}` : req?.status === "pending" ? ` · chờ duyệt ${req.no}` : x.issue ? ` · ${issueText(x)}` : ""}`;
        const miss = (v: string | null) => v ? null : <T style={{ color: x.kind === "work" ? C.bad : C.ink3, fontFamily: F.medium }}>--:--</T>;
        return <>
          <H3>{WD_ISO_FULL[x.weekday]}, {ddmm(x.date)}</H3><Sub>{x.shift ? `${x.shift.name} · ${x.shift.start} – ${x.shift.end}` : "Không có ca làm việc"}</Sub>
          {x.kind === "work" || x.kind === "today" ? <Box>
            <SecT style={{ marginTop: 10 }}>Bản ghi gốc</SecT>
            <Ln k="Vào ca" v={miss(x.rawIn) ?? x.rawIn!} />
            <Ln k="Ra ca" v={miss(x.rawOut) ?? x.rawOut!} />
            {x.adjusted ? <><SecT style={{ marginTop: 10 }}>Ghi nhận sau điều chỉnh</SecT><Ln k="Vào ca" v={x.clockIn ?? "--:--"} /><Ln k="Ra ca" v={x.clockOut ?? "--:--"} /></> : null}
          </Box> : null}
          <Box>
            {x.workedMinutes ? <Ln k="Giờ làm" v={gh(x.workedMinutes)} /> : null}
            {x.overtime ? <Ln k={`Làm thêm (${x.overtime.ratePercent}%)`} v={`${gh(x.overtime.minutes)} · ${x.overtime.requestNos.join(", ")}`} /> : null}
            <Ln k="Kết quả công" v={<T style={{ fontFamily: F.bold }}>{result}</T>} />
          </Box>
          {x.canExplain ? <Btn block onPress={() => ACT.exFromDay(x.date)}>Giải trình ngày này</Btn>
            : req ? <Btn kind="ghost" block onPress={() => { S.param = req.no; go("reqDetail"); }}>Xem đơn {req.no}</Btn>
            : x.issue && x.kind === "work" ? <><ErrLine>{S.ts?.period.locked ? "Kỳ công đã khóa." : S.ts?.explanation && S.ts.explanation.left <= 0 ? "Đã hết lượt giải trình. Liên hệ phòng Nhân sự." : "Đã quá hạn giải trình. Liên hệ phòng Nhân sự."}</ErrLine><Close /></>
            : <Close />}
        </>;
      }
      const d = +(arg ?? 16), o = day(d) || { d }, i = dayInfo(o);
      const raw = (o.today ? [S.clockIn && ["Vào ca", hm(S.clockIn)], S.clockOut && ["Ra ca", hm(S.clockOut)]] : o.leave ? [] : [o.in && ["Vào ca", o.in], o.out && ["Ra ca", o.out]]).filter(Boolean) as Array<[string, string]>;
      const result = o.leave ? "1 công · nghỉ phép có lương" : o.explained ? `1 công · đã điều chỉnh theo ${o.explained}` : o.pendingEx ? "Chờ duyệt giải trình" : i.issue ? "0,5 công · thiếu bản ghi" : o.today ? "Đang tính" : "1 công";
      return <>
        <H3>{WDF[wdOct(d)]}, {pad(d)}/10</H3><Sub>{shiftLabel()} · {shiftTime()}</Sub>
        <Box>
          <SecT style={{ marginTop: 10 }}>Bản ghi gốc</SecT>
          {raw.length ? raw.map((r) => <Ln key={r[0]} k={r[0] + " · GPS trong vùng"} v={r[1]} />) : <T style={{ color: C.ink2, marginTop: 6, marginBottom: 10 }}>{o.leave ? "Không cần chấm công ngày nghỉ phép." : "Không có bản ghi."}</T>}
          {i.issue ? <Ln kNode={<T style={{ color: C.bad }}>{!o.in ? "Vào ca" : "Ra ca"} · không có bản ghi</T>} v={<T style={{ color: C.bad, fontFamily: F.medium }}>--:--</T>} /> : null}
        </Box>
        <Box><Ln k="Kết quả công" v={<T style={{ fontFamily: F.bold }}>{result}</T>} /></Box>
        {i.issue ? (explainLeft() > 0 ? <Btn block onPress={() => ACT.exFromDay(String(d))}>Giải trình ngày này</Btn> : <ErrLine>Đã hết lượt giải trình. Liên hệ phòng Nhân sự.</ErrLine>) : <Close />}
      </>;
    }
    case "askPay": return <>
      <H3>Hỏi HR về lương tháng {arg}</H3><Sub>HR trả lời trong app, thường trong 2 ngày làm việc</Sub>
      <Chips wrap>{["Ngày công", "Làm thêm giờ", "Phụ cấp", "Thuế, bảo hiểm", "Trừ tạm ứng"].map((c, i) => <Chip key={c} on={S.f.payChip === i} label={c} onPress={() => { S.f.payChip = i; emit(); }} />)}</Chips>
      <TextArea placeholder="Ví dụ: Tháng 9 em làm thêm 10 giờ nhưng phiếu chỉ tính 9,8 giờ." defaultValue={S.f.payQ} onChangeText={(t) => { S.f.payQ = t; }} />
      <Btn block onPress={ACT.payQSend}>Gửi cho HR</Btn>
    </>;
    case "advExplain": if (REMOTE && S.advData?.policy) {
      const d = S.advData, p = d.policy!;
      return <>
        <H3>Cách tính hạn mức</H3>
        <Box><Ln k="Lương cơ bản" v={d.baseSalary ? `${d.baseSalary.toLocaleString("vi-VN")} ₫` : "Chưa có"} /><Ln k="Tỷ lệ cho phép" v={`${p.maxPercent}%`} /><Ln k="Hạn mức tháng" v={`${d.limit.toLocaleString("vi-VN")} ₫`} kind="tot" /></Box>
        <View style={{ paddingLeft: 18, gap: 4 }}>
          {[`Mỗi tháng ứng 1 lần, gửi đến hết ngày ${Number(d.deadline?.slice(8) ?? p.deadlineDay)}.`, `Tối thiểu ${p.minAmount.toLocaleString("vi-VN")} ₫ mỗi lần.`, "Khoản ứng được trừ vào lương của chính tháng đó.", "Tỷ lệ và hạn nhận đơn do công ty cấu hình."].map((x) => (
            <View key={x} style={{ flexDirection: "row" }}><T style={{ position: "absolute", left: -13, fontSize: 13.5, color: C.ink2 }}>•</T><T style={{ fontSize: 13.5, color: C.ink2 }}>{x}</T></View>
          ))}
        </View>
        <Close>Đã hiểu</Close>
      </>;
    } return <>
      <H3>Cách tính hạn mức</H3>
      <Box><Ln k="Lương cơ bản" v="15.000.000 ₫" /><Ln k="Tỷ lệ cho phép" v="30%" /><Ln k="Hạn mức tháng" v="4.500.000 ₫" kind="tot" /></Box>
      <View style={{ paddingLeft: 18, gap: 4 }}>
        {[`Mỗi tháng ứng 1 lần, gửi trước ngày ${ADV_DAY}.`, "Khoản ứng được trừ vào lương của chính tháng đó.", "Tỷ lệ và hạn nhận đơn do công ty cấu hình."].map((x) => (
          <View key={x} style={{ flexDirection: "row" }}><T style={{ position: "absolute", left: -13, fontSize: 13.5, color: C.ink2 }}>•</T><T style={{ fontSize: 13.5, color: C.ink2 }}>{x}</T></View>
        ))}
      </View>
      <Close>Đã hiểu</Close>
    </>;
    case "advReview": if (REMOTE && S.advData) {
      const d = S.advData;
      return <>
        <H3>Kiểm tra đề nghị</H3>
        <Box><Ln k="Số tiền" v={`${S.advAmt.toLocaleString("vi-VN")} ₫`} /><Ln k="Nhận vào" v="Tài khoản nhận lương" /><Ln k="Trừ vào" v={`Lương ${d.month.slice(5)}/${d.month.slice(0, 4)}`} />
          <Ln k="Duyệt" v={`${d.approvers.join(" → ")}${d.hrOverAmount && S.advAmt > d.hrOverAmount ? " (thêm HR)" : ""}`} /></Box>
        <T style={{ color: C.ink3, fontSize: 12 }}>{`Sau khi gửi, bạn không tạo thêm đề nghị tạm ứng trong tháng ${Number(d.month.slice(5))}.`}</T>
        <Btn block spinKey="advConfirm" icon={<Ic n="lock" s={18} w={2} color="#fff" />} onPress={ACT.advConfirm}>Xác nhận bằng PIN</Btn>
      </>;
    } return <>
      <H3>Kiểm tra đề nghị</H3>
      <Box><Ln k="Số tiền" v={`${String(S.advAmt).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`} /><Ln k="Nhận vào" v="Vietcombank •6789" /><Ln k="Trừ vào" v="Lương 10/2026" /><Ln k="Duyệt" v="QL → HR → Kế toán" /></Box>
      <T style={{ color: C.ink3, fontSize: 12 }}>Sau khi gửi, bạn không tạo thêm đề nghị tạm ứng trong tháng 10.</T>
      <Btn block icon={<Ic n="lock" s={18} w={2} color="#fff" />} onPress={ACT.advConfirm}>Xác nhận bằng PIN</Btn>
    </>;
    case "advCancel": return <>
      <H3>Hủy đề nghị tạm ứng?</H3><Sub>{REMOTE && S.advData?.deadline ? `Bạn có thể tạo đề nghị mới đến hết ngày ${S.advData.deadline.slice(8)}/${S.advData.deadline.slice(5, 7)}.` : `Bạn có thể tạo đề nghị mới trước ngày ${ADV_DAY}/10.`}</Sub>
      <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Giữ lại</Btn><Btn kind="danger" spinKey="advCancelGo" onPress={ACT.advCancelGo}>Hủy đề nghị</Btn></BtnRow>
    </>;
    case "cancelAsk": return <>
      <H3>Hủy đơn {arg}?</H3><Sub>Đơn sẽ rời khỏi danh sách chờ của người duyệt.</Sub>
      <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Giữ đơn</Btn><Btn kind="danger" onPress={() => ACT.cancelGo(arg!)}>Hủy đơn</Btn></BtnRow>
    </>;
    case "rejectAsk": return <>
      <H3>Từ chối đơn {arg}</H3><Sub>Người gửi sẽ thấy lý do này</Sub>
      <TextArea placeholder="Ví dụ: Trùng lịch bàn giao dự án, đề nghị dời sang tuần sau." defaultValue={S.f.rej} onChangeText={(t) => { S.f.rej = t; if (S.f.rejErr && t.trim()) { S.f.rejErr = false; emit(); } }} />
      {S.f.rejErr ? <ErrLine>Nhập lý do từ chối.</ErrLine> : null}
      <Btn kind="danger" block onPress={() => ACT.rejectGo(arg!)}>Từ chối đơn</Btn>
    </>;
    case "bulkResult": {
      const res = JSON.parse(arg ?? "[]") as Array<{ id: string; who: string; fail: boolean }>;
      return <>
        <H3>Đã xử lý {res.filter((z) => !z.fail).length}/{res.length} đơn</H3>
        <Box>{res.map((z) => (
          <Ln key={z.id} kNode={<View><T style={{ fontFamily: F.bold, color: C.ink }}>{z.id} · {z.who}</T><T style={{ color: C.ink3, fontSize: 11.5 }}>{z.fail ? "Tạm ứng phải duyệt từng đơn để xem hạn mức" : "Đã duyệt"}</T></View>}
            v={<Ic n={z.fail ? "alert" : "check"} s={18} w={2.2} color={z.fail ? C.bad : C.ok} />} />
        ))}</Box>
        <Close kind="primary">Xong</Close>
      </>;
    }
    /* Bản dùng API: đủ trường người dùng chốt 26/10 (điện thoại, email cá nhân, địa chỉ, liên hệ khẩn cấp, tài khoản ngân hàng) — thiết kế bổ sung
       theo khuôn sheet của prototype; đang có đề nghị chờ thì không sửa tiếp (như ghi chú HS-0221 của prototype) */
    case "editProfile": if (REMOTE) {
      const p = S.profile, set = (k: keyof typeof S.f) => (t: string) => { (S.f as Record<string, unknown>)[k] = t; };
      return <>
        <H3>Đề nghị sửa thông tin</H3><Sub>Có hiệu lực sau khi HR duyệt</Sub>
        {p?.pending ? <>
          <Note icon="lock">{`Bạn đang có đề nghị ${p.pending.no} chờ HR duyệt, chưa sửa tiếp được. Hủy đề nghị đó nếu cần gửi lại.`}</Note>
          <Btn block kind="ghost" onPress={() => { closeSheet(); ACT.openPendingProfile(); }}>Xem đề nghị {p.pending.no}</Btn>
        </> : <>
          <Field label="Số điện thoại"><Inp defaultValue={S.f.pfPhone} keyboardType="phone-pad" onChangeText={set("pfPhone")} /></Field>
          <Field label="Email cá nhân"><Inp defaultValue={S.f.pfEmail} keyboardType="email-address" autoCapitalize="none" placeholder="ví dụ: ten@gmail.com" onChangeText={set("pfEmail")} /></Field>
          <Field label="Địa chỉ"><Inp defaultValue={S.f.pfAddr} onChangeText={set("pfAddr")} /></Field>
          <Field label="Liên hệ khẩn cấp">
            <Inp defaultValue={S.f.pfEmName} placeholder="Họ tên" onChangeText={set("pfEmName")} />
            <Inp defaultValue={S.f.pfEmPhone} placeholder="Số điện thoại" keyboardType="phone-pad" onChangeText={set("pfEmPhone")} />
            <Inp defaultValue={S.f.pfEmRel} placeholder="Quan hệ (bố, mẹ, vợ/chồng…)" onChangeText={set("pfEmRel")} />
          </Field>
          <Field label="Tài khoản ngân hàng">
            <Inp defaultValue={S.f.pfBank} placeholder="Ngân hàng" onChangeText={set("pfBank")} />
            <Inp defaultValue={S.f.pfAcc} placeholder="Số tài khoản" keyboardType="number-pad" onChangeText={set("pfAcc")} />
            <Inp defaultValue={S.f.pfHolder} placeholder="Chủ tài khoản" autoCapitalize="characters" onChangeText={set("pfHolder")} />
          </Field>
          <Field label="Lý do (không bắt buộc)"><Inp defaultValue={S.f.pfReason} onChangeText={set("pfReason")} /></Field>
          {S.f.pfErr ? <ErrLine>{S.f.pfErr}</ErrLine> : null}
          <Btn block spinKey="pfSend" onPress={ACT.pfSend}>Gửi đề nghị</Btn>
        </>}
      </>;
    }
    return <>
      <H3>Đề nghị sửa thông tin</H3><Sub>Có hiệu lực sau khi HR duyệt</Sub>
      <Field label="Số điện thoại"><Inp defaultValue={S.f.pfPhone} keyboardType="phone-pad" onChangeText={(t) => { S.f.pfPhone = t; }} /></Field>
      <Field label="Địa chỉ"><Inp defaultValue={S.f.pfAddr} onChangeText={(t) => { S.f.pfAddr = t; }} /></Field>
      <Note icon="lock">Tài khoản ngân hàng đang có đề nghị HS-0221 chờ duyệt, chưa sửa tiếp được.</Note>
      <Btn block onPress={ACT.pfSend}>Gửi đề nghị</Btn>
    </>;
    case "logoutAsk": return <>
      <H3>Đăng xuất?</H3><Sub>Widget chấm công sẽ ngừng hoạt động đến khi bạn đăng nhập lại.</Sub>
      <BtnRow><Btn kind="ghost" onPress={() => closeSheet()}>Ở lại</Btn><Btn kind="danger" onPress={ACT.logoutGo}>Đăng xuất</Btn></BtnRow>
    </>;
  }
  return null;
}

const styles = StyleSheet.create({
  box: { ...glass, experimental_backgroundImage: "linear-gradient(155deg, rgba(255,255,255,0.7), rgba(236,248,242,0.55))", borderRadius: 18, paddingVertical: 6, paddingHorizontal: 16 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.line2 },
  pinDotOn: { ...tint, borderWidth: 1 },
  keypad: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 14, paddingHorizontal: 6 },
  key: { ...glass, width: "29.6%", flexGrow: 1, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  keyPlain: { experimental_backgroundImage: undefined, backgroundColor: "transparent", borderWidth: 0, boxShadow: undefined },
});
