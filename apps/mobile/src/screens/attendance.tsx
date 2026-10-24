import type React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { C, F, GL, glass, tint } from "../theme";
import { Gi, Ic } from "../icons";
import { Appear, Rise } from "../motion";
import { Btn, Card, Empty, ErrLine, Num, St, T } from "../ui";
import { TabHead, type ScreenSpec } from "../screen";
import { WD, gh, pad, toMin, wdOct, type OctDay } from "../data";
import { REMOTE } from "../api/http";
import { ACT, S, WD_ISO, day, dayInfo, ddmm, explainLeft, go, monthTitle, shiftMinutes, toast } from "../store";
import type { TimesheetDay } from "@kavor/contracts";

/* Một dòng ngày: dùng chung cho dữ liệu mẫu (OctDay) và bảng công thật (TimesheetDay) */
type RowModel = {
  dayNum: string; wd: string; today?: boolean; leave?: boolean; leaveLabel?: string;
  inV: string | null; outV: string | null; inOk: boolean; outOk: boolean; flagIn: boolean; flagOut: boolean;
  hrs: string; hrsColor: string; note: [string, string] | null; canEx: boolean; onPress: () => void; onExplain: () => void;
};

function ArRow({ m, first }: { m: RowModel; first?: boolean }) {
  const tm = (v: string | null, ok: boolean, flag: boolean, arrow: "arIn" | "arOut") => (
    <View style={styles.tm}>
      {flag ? <View style={styles.ex}><T style={{ fontSize: 11, lineHeight: 14, fontFamily: F.bold, color: "#E58A1F" }}>!</T></View> : <Ic n={arrow} s={16} w={2.2} color={C.emerald} />}
      <Num style={{ fontSize: 15, fontFamily: F.medium, color: !v ? C.ink3 : ok ? C.ok : C.bad }}>{v || "--:--"}</Num>
    </View>
  );
  return (
    <Pressable onPress={m.onPress} style={({ pressed }) => [styles.ar, pressed && { backgroundColor: C.soft }]}>
      {!first ? <View style={styles.arLine} /> : null}
      <View style={styles.arGrid}>
        <View style={{ width: 64 }}>
          <View style={[styles.dbox, m.today && styles.dboxToday]}>
            <Num style={{ fontSize: 20, lineHeight: 22, fontFamily: F.semibold, color: m.today ? "#fff" : C.ink }}>{m.dayNum}</Num>
            <T style={{ fontSize: 11, lineHeight: 12.1, fontFamily: F.semibold, letterSpacing: 0.44, color: m.today ? "#fff" : C.ink }}>{m.wd}</T>
          </View>
        </View>
        {m.leave ? <View style={{ flex: 2 }}><T style={{ fontSize: 14, fontFamily: F.medium, color: C.violet }}>{m.leaveLabel ?? "Nghỉ phép năm"}</T></View> : <>
          <View style={{ flex: 1 }}>{tm(m.inV, m.inOk, m.flagIn, "arIn")}</View>
          <View style={{ flex: 1 }}>{tm(m.outV, m.outOk, m.flagOut, "arOut")}</View>
        </>}
        <View style={styles.hrs}>
          <Num style={{ fontSize: 15, fontFamily: F.medium, color: m.hrsColor }}>{m.hrs}</Num>
          <Ic n="chevR" s={16} w={2} color={C.ink3} />
        </View>
      </View>
      {m.note || m.canEx ? (
        <View style={styles.noteL}>
          {m.note ? <St s={m.note[1] as "ok"}>{m.note[0]}</St> : null}
          {m.canEx ? <Pressable onPress={m.onExplain} style={styles.exBtn}><T style={{ fontSize: 12, fontFamily: F.semibold, color: "#fff" }}>Giải trình</T></Pressable> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/* Dữ liệu mẫu của prototype (tháng 10/2026) */
function octModel(o: OctDay, filtered?: boolean): RowModel {
  const i = dayInfo(o);
  const hrsColor = i.leave ? C.ink3 : i.hrs == null ? C.ink3 : i.hrs >= shiftMinutes() ? C.ok : C.bad;
  return {
    dayNum: pad(o.d), wd: WD[wdOct(o.d)]!, today: o.today, leave: i.leave, inV: i.in ?? null, outV: i.out ?? null, inOk: i.inOk, outOk: i.outOk, flagIn: i.flagIn, flagOut: i.flagOut,
    hrs: i.hrs != null ? gh(i.hrs) : i.leave ? gh(shiftMinutes()) : "--:--", hrsColor, note: i.note as [string, string] | null,
    canEx: !!filtered && explainLeft() > 0 && !o.explained && !o.pendingEx && !o.today, onPress: () => ACT.day(String(o.d)), onExplain: () => ACT.exFromDay(String(o.d)),
  };
}

/* Bảng công thật: ghi chú theo bất thường/đơn giải trình; ô đỏ khi đi muộn/về sớm/thiếu */
function tsModel(d: TimesheetDay, filtered?: boolean): RowModel {
  const shiftMin = d.shift ? toMin(d.shift.end) - toMin(d.shift.start) - S.sh.breakMin : shiftMinutes();
  const req = d.request;
  const note: [string, string] | null = d.kind === "holiday" ? [d.holidayName ?? "Nghỉ lễ", "mute"]
    : req && req.status === "approved" ? [`Đã điều chỉnh theo ${req.no}`, "ok"]
    : req && req.status === "pending" ? ["Giải trình đang chờ duyệt", "warn"]
    : d.issue === "missing_in" ? ["Thiếu giờ vào", "bad"] : d.issue === "missing_out" ? ["Thiếu giờ ra", "bad"] : d.issue === "absent" ? ["Không chấm công", "bad"]
    : d.issue === "late" || d.issue === "late_early" ? [`Muộn ${d.lateMinutes} phút`, "bad"] : d.issue === "early" ? [`Về sớm ${d.earlyMinutes} phút`, "bad"]
    : d.leave && d.kind !== "leave" ? [`${d.leave.typeName} buổi ${d.leave.half === "am" ? "sáng" : "chiều"}`, "mute"]
    : d.overtime ? [`Làm thêm ${String(Math.round(d.overtime.minutes / 6) / 10).replace(".", ",")} giờ · ${d.overtime.ratePercent}%`, "ok"] : null;
  return {
    dayNum: d.date.slice(8, 10), wd: WD_ISO[d.weekday]!, today: d.kind === "today", leave: d.kind === "holiday" || d.kind === "leave",
    leaveLabel: d.kind === "leave" ? d.leave?.typeName ?? "Nghỉ phép" : d.holidayName ?? "Nghỉ lễ",
    inV: d.clockIn, outV: d.clockOut, inOk: !d.lateMinutes, outOk: !d.earlyMinutes,
    flagIn: d.kind === "work" && !d.clockIn, flagOut: d.kind === "work" && !d.clockOut,
    hrs: d.workedMinutes ? gh(d.workedMinutes) : d.kind === "leave" && d.leave?.paid ? gh(shiftMin) : "--:--", hrsColor: !d.workedMinutes ? C.ink3 : d.workedMinutes >= shiftMin ? C.ok : C.bad,
    note: d.kind === "holiday" ? null : d.kind === "leave" ? [`Theo đơn ${d.leave?.requestNo ?? ""}`, "mute"] : note, canEx: !!filtered && d.canExplain, onPress: () => ACT.day(d.date), onExplain: () => ACT.exFromDay(d.date),
  };
}

export function attendanceSpec(): ScreenSpec {
  if (REMOTE) return remoteAttendanceSpec();
  const fixed = S.shift === "fixed";
  if (S.attFilter === "late" && !fixed) S.attFilter = "all";
  const f = S.attFilter;
  const lateDays = S.oct.filter((o) => fixed && o.in && o.out && toMin(o.in) > S.sh.start);
  const missDays = S.oct.filter((o) => !o.today && !o.leave && (!o.in || !o.out));
  const missOpen = missDays.filter((o) => !o.explained && !o.pendingEx).length;
  const left = explainLeft();
  const rows: React.ReactElement[] = [];
  if (f === "all") {
    for (let d = 16; d >= 1; d--) {
      const wd = wdOct(d);
      if (wd === 0) { rows.push(<View key={`wk${d}`} style={styles.wk}><T style={{ fontSize: 13.5, color: C.ink2, textAlign: "center" }}>Cuối tuần: {pad(d)} Chủ Nhật & {pad(d - 1)} Thứ Bảy</T></View>); continue; }
      if (wd === 6) continue;
      rows.push(<ArRow key={d} m={octModel(day(d) || { d })} first={!rows.length || rows[rows.length - 1]?.key?.toString().startsWith("wk")} />);
    }
  } else {
    const list = (f === "late" ? lateDays : missDays).slice().sort((a, b) => b.d - a.d);
    list.forEach((o, i) => rows.push(<ArRow key={o.d} m={octModel(o, true)} first={i === 0} />));
    if (!list.length) rows.push(<View key="empty" style={{ paddingVertical: 28 }}><Empty icon={<Gi n="checks" s={36} />} title="Không có ngày nào" /></View>);
  }
  const sumBtn = (key: "all" | "late" | "miss", value: React.ReactElement, label: string, disabled?: boolean) => (
    <Pressable key={key} disabled={disabled} onPress={() => ACT.attFilter(key)} style={[styles.sum, f === key && styles.sumOn, disabled && { opacity: 0.45 }]}>
      {value}
      <T style={{ fontSize: 12, fontFamily: f === key ? F.semibold : F.medium, color: f === key ? C.emerald : C.ink3 }}>{label}</T>
    </Pressable>
  );
  return {
    nav: true,
    head: <TabHead title="Bảng công" />,
    body: [
      <View key="m" style={styles.month}>
        <Pressable accessibilityLabel="Tháng trước" style={styles.mBtn} onPress={() => toast("Prototype chỉ có dữ liệu tháng 10/2026")}><Ic n="chevL" s={20} w={2} color={C.ink3} /></Pressable>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Ic n="cal" s={20} w={1.8} color={C.emerald} /><T style={{ fontSize: 16, fontFamily: F.semibold, color: C.emerald }}>Tháng 10, 2026</T></View>
        <Pressable accessibilityLabel="Tháng sau" style={styles.mBtn} onPress={() => toast("Tháng 11 chưa bắt đầu")}><Ic n="chevR" s={20} w={2} color={C.ink3} /></Pressable>
      </View>,
      <View key="sum" style={{ flexDirection: "row", gap: 8 }}>
        {sumBtn("all", <Num style={styles.sumB}>10<T style={{ fontSize: 14, color: C.ink2 }}>/22</T></Num>, "Ngày công")}
        {sumBtn("late", <Num style={[styles.sumB, fixed && lateDays.length ? { color: C.bad } : null]}>{fixed ? lateDays.length : "—"}</Num>, "Đi muộn", !fixed)}
        {sumBtn("miss", <Num style={[styles.sumB, missOpen ? { color: C.bad } : null]}>{missOpen}</Num>, "Thiếu công")}
      </View>,
      f !== "all" ? (
        <Appear key={`ex${f}`}>
          <Card pad style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Gi n="hour" s={26} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: F.semibold }}>Còn {left}/3 lượt giải trình</T>
                <T style={{ fontSize: 12.5, color: C.ink2 }}>Hạn 22/10, trước chốt công 25/10 · app nhắc lúc 09:00 ngày 20 và 22</T>
              </View>
              <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>{[0, 1, 2].map((k) => <View key={k} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k < S.explainUsed ? C.warn : C.line2 }} />)}</View>
            </View>
            {left ? <Btn sm block onPress={() => go("explain")}>Tạo giải trình</Btn> : <ErrLine>Đã hết lượt giải trình tháng này.</ErrLine>}
          </Card>
        </Appear>
      ) : null,
      f !== "all" ? (
        <View key="fl" style={styles.filterLine}>
          <T style={{ fontSize: 13, color: C.ink2, fontFamily: F.medium }}>{f === "late" ? "Ngày đi muộn" : "Ngày thiếu công"} · {(f === "late" ? lateDays : missDays).length} ngày</T>
          <Pressable hitSlop={8} onPress={() => ACT.attFilter("all")}><T style={{ fontSize: 13, color: C.emerald, fontFamily: F.semibold }}>Bỏ lọc</T></Pressable>
        </View>
      ) : null,
      <View key={`att${f}`} style={styles.att}>
        <View style={styles.attH}>
          <T style={[styles.attHT, { width: 64 }]}>Ngày</T>
          <T style={[styles.attHT, { flex: 1 }]}>Giờ vào</T>
          <T style={[styles.attHT, { flex: 1 }]}>Giờ ra</T>
          <T style={[styles.attHT, { width: 76, textAlign: "right", paddingRight: 16 }]}>Giờ làm</T>
        </View>
        {rows.map((r, i) => f === "all" ? r : <Rise key={i} index={i} enabled duration={450}>{r}</Rise>)}
      </View>,
    ],
  };
}

/* Bảng công từ API: kỳ công theo cấu hình công ty (vd 26 → 25), lọc đi muộn/thiếu công, lượt và hạn giải trình thật */
function remoteAttendanceSpec(): ScreenSpec {
  const t = S.ts;
  const f = S.attFilter;
  const head = <TabHead title="Bảng công" />;
  if (!t) return { nav: true, head, body: [
    <View key="ld" style={styles.att}><Empty icon={<Gi n="cal" s={36} />} title="Đang tải bảng công…" text="Cần kết nối mạng để xem bảng công." /></View>,
  ] };
  const shown = t.days.filter((d) => d.kind !== "future" && d.kind !== "not_employed").slice().reverse();
  const current = t.days.some((d) => d.kind === "today" || d.kind === "future");
  const isLate = (d: TimesheetDay) => d.lateMinutes > 0 && !(d.request && d.request.status !== "rejected");
  const isMiss = (d: TimesheetDay) => (d.issue === "missing_in" || d.issue === "missing_out" || d.issue === "absent") && !(d.request && d.request.status !== "rejected");
  const lateDays = shown.filter(isLate), missDays = shown.filter(isMiss);
  const q = t.explanation, left = q ? q.left : 0;
  const rows: React.ReactElement[] = [];
  if (f === "all") {
    for (let i = 0; i < shown.length; i++) {
      const d = shown[i]!;
      if (d.kind === "off") {
        /* Gộp các ngày nghỉ liền nhau thành một dải như prototype */
        let j = i; while (j + 1 < shown.length && shown[j + 1]!.kind === "off") j++;
        const run = shown.slice(i, j + 1).reverse();
        const label = run.map((x) => `${ddmm(x.date)} ${x.weekday === 7 ? "Chủ Nhật" : x.weekday === 6 ? "Thứ Bảy" : "Ngày nghỉ"}`).join(" & ");
        rows.push(<View key={`wk${d.date}`} style={styles.wk}><T style={{ fontSize: 13.5, color: C.ink2, textAlign: "center" }}>{run.every((x) => x.weekday >= 6) ? "Cuối tuần" : "Ngày nghỉ"}: {label}</T></View>);
        i = j; continue;
      }
      rows.push(<ArRow key={d.date} m={tsModel(d)} first={!rows.length || rows[rows.length - 1]?.key?.toString().startsWith("wk")} />);
    }
    if (!rows.length) rows.push(<View key="empty" style={{ paddingVertical: 28 }}><Empty icon={<Gi n="cal" s={36} />} title="Kỳ công chưa có ngày nào" /></View>);
  } else {
    const list = f === "late" ? lateDays : missDays;
    list.forEach((d, i) => rows.push(<ArRow key={d.date} m={tsModel(d, true)} first={i === 0} />));
    if (!list.length) rows.push(<View key="empty" style={{ paddingVertical: 28 }}><Empty icon={<Gi n="checks" s={36} />} title="Không có ngày nào" /></View>);
  }
  const sumBtn = (key: "all" | "late" | "miss", value: React.ReactElement, label: string) => (
    <Pressable key={key} onPress={() => ACT.attFilter(key)} style={[styles.sum, f === key && styles.sumOn]}>
      {value}
      <T style={{ fontSize: 12, fontFamily: f === key ? F.semibold : F.medium, color: f === key ? C.emerald : C.ink3 }}>{label}</T>
    </Pressable>
  );
  /* Hạn gần nhất trong các ngày còn giải trình được */
  const deadline = shown.filter((d) => d.canExplain && d.explainDeadline).map((d) => d.explainDeadline!).sort()[0];
  const exText = t.period.locked ? "Kỳ công đã khóa, không gửi thêm giải trình."
    : `${deadline ? `Hạn gần nhất ${ddmm(deadline)}` : "Không còn ngày cần giải trình"} · chốt công ${ddmm(t.period.end)}${q ? ` · trong ${q.deadlineDays} ngày làm việc` : ""}`;
  const busy = S.spin === "tsMonth";
  return {
    nav: true,
    head,
    body: [
      <View key="m" style={styles.month}>
        <Pressable accessibilityLabel="Kỳ trước" disabled={busy} style={styles.mBtn} onPress={() => ACT.tsMonth(-1)}><Ic n="chevL" s={20} w={2} color={C.ink3} /></Pressable>
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Ic n="cal" s={20} w={1.8} color={C.emerald} /><T style={{ fontSize: 16, fontFamily: F.semibold, color: C.emerald }}>{monthTitle(t.period.month)}</T></View>
          <T style={{ fontSize: 11.5, color: C.ink3 }}>{ddmm(t.period.start)} – {ddmm(t.period.end)}{t.period.locked ? " · đã khóa" : ""}</T>
        </View>
        <Pressable accessibilityLabel="Kỳ sau" disabled={busy} style={[styles.mBtn, current && { opacity: 0.4 }]} onPress={() => current ? toast("Kỳ công sau chưa bắt đầu") : ACT.tsMonth(1)}><Ic n="chevR" s={20} w={2} color={C.ink3} /></Pressable>
      </View>,
      <View key="sum" style={{ flexDirection: "row", gap: 8 }}>
        {sumBtn("all", <Num style={styles.sumB}>{t.summary.credited}<T style={{ fontSize: 14, color: C.ink2 }}>/{t.summary.standard}</T></Num>, "Ngày công")}
        {sumBtn("late", <Num style={[styles.sumB, lateDays.length ? { color: C.bad } : null]}>{lateDays.length}</Num>, "Đi muộn")}
        {sumBtn("miss", <Num style={[styles.sumB, missDays.length ? { color: C.bad } : null]}>{missDays.length}</Num>, "Thiếu công")}
      </View>,
      f !== "all" && q ? (
        <Appear key={`ex${f}`}>
          <Card pad style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Gi n="hour" s={26} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: F.semibold }}>Còn {left}/{q.limit} lượt giải trình</T>
                <T style={{ fontSize: 12.5, color: C.ink2 }}>{exText}</T>
              </View>
              <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>{Array.from({ length: Math.min(q.limit, 8) }, (_, k) => <View key={k} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k < q.used ? C.warn : C.line2 }} />)}</View>
            </View>
            {t.period.locked ? null : left ? <Btn sm block onPress={() => { S.exDay = null; go("explain"); }}>Tạo giải trình</Btn> : <ErrLine>Đã hết lượt giải trình kỳ này.</ErrLine>}
          </Card>
        </Appear>
      ) : null,
      f !== "all" ? (
        <View key="fl" style={styles.filterLine}>
          <T style={{ fontSize: 13, color: C.ink2, fontFamily: F.medium }}>{f === "late" ? "Ngày đi muộn" : "Ngày thiếu công"} · {(f === "late" ? lateDays : missDays).length} ngày</T>
          <Pressable hitSlop={8} onPress={() => ACT.attFilter("all")}><T style={{ fontSize: 13, color: C.emerald, fontFamily: F.semibold }}>Bỏ lọc</T></Pressable>
        </View>
      ) : null,
      <View key={`att${f}${t.period.month}`} style={styles.att}>
        <View style={styles.attH}>
          <T style={[styles.attHT, { width: 64 }]}>Ngày</T>
          <T style={[styles.attHT, { flex: 1 }]}>Giờ vào</T>
          <T style={[styles.attHT, { flex: 1 }]}>Giờ ra</T>
          <T style={[styles.attHT, { width: 76, textAlign: "right", paddingRight: 16 }]}>Giờ làm</T>
        </View>
        {rows.map((r, i) => f === "all" ? r : <Rise key={i} index={i} enabled duration={450}>{r}</Rise>)}
      </View>,
    ],
  };
}

const styles = StyleSheet.create({
  month: { ...glass, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, padding: 6 },
  mBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sum: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, borderWidth: 1, borderColor: "transparent" },
  sumOn: { ...glass },
  sumB: { fontSize: 22, fontFamily: F.semibold },
  filterLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, marginBottom: -12 },
  att: { ...glass, borderRadius: 22, overflow: "hidden" },
  attH: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 44, backgroundColor: "rgba(236,248,242,0.75)" },
  attHT: { fontSize: 13, fontFamily: F.semibold },
  ar: { paddingVertical: 12, paddingHorizontal: 16 },
  arLine: { position: "absolute", top: 0, left: 80, right: 16, height: 1, backgroundColor: C.line },
  arGrid: { flexDirection: "row", alignItems: "center" },
  dbox: { width: 52, height: 56, borderWidth: 1, borderColor: C.line2, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.75)" },
  dboxToday: { ...tint, borderColor: "rgba(255,255,255,0.25)", backgroundColor: undefined },
  tm: { flexDirection: "row", alignItems: "center", gap: 5 },
  ex: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFE7C7", alignItems: "center", justifyContent: "center" },
  hrs: { width: 76, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  noteL: { marginLeft: 64, marginTop: 4, minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  exBtn: { marginLeft: "auto", height: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: "center", experimental_backgroundImage: GL.tint, boxShadow: GL.tintSh },
  wk: { marginVertical: 8, marginHorizontal: 12, padding: 14, borderRadius: 12, backgroundColor: C.warnSoft },
});
