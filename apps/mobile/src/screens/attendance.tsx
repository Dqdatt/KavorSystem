import type React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { C, F, GL, glass, tint } from "../theme";
import { Gi, Ic } from "../icons";
import { Appear, Rise } from "../motion";
import { Btn, Card, Empty, ErrLine, Num, St, T } from "../ui";
import { TabHead, type ScreenSpec } from "../screen";
import { WD, gh, pad, toMin, wdOct, type OctDay } from "../data";
import { ACT, S, day, dayInfo, explainLeft, go, toast } from "../store";

function ArRow({ o, filtered, first }: { o: OctDay; filtered?: boolean; first?: boolean }) {
  const i = dayInfo(o);
  const canEx = filtered && explainLeft() > 0 && !o.explained && !o.pendingEx && !o.today;
  const tm = (v: string | null, ok: boolean, flag: boolean, arrow: "arIn" | "arOut") => (
    <View style={styles.tm}>
      {flag ? <View style={styles.ex}><T style={{ fontSize: 11, lineHeight: 14, fontFamily: F.bold, color: "#E58A1F" }}>!</T></View> : <Ic n={arrow} s={16} w={2.2} color={C.emerald} />}
      <Num style={{ fontSize: 15, fontFamily: F.medium, color: !v ? C.ink3 : ok ? C.ok : C.bad }}>{v || "--:--"}</Num>
    </View>
  );
  const hrsColor = i.leave ? C.ink3 : i.hrs == null ? C.ink3 : i.hrs >= 480 ? C.ok : C.bad;
  return (
    <Pressable onPress={() => ACT.day(String(o.d))} style={({ pressed }) => [styles.ar, pressed && { backgroundColor: C.soft }]}>
      {!first ? <View style={styles.arLine} /> : null}
      <View style={styles.arGrid}>
        <View style={{ width: 64 }}>
          <View style={[styles.dbox, o.today && styles.dboxToday]}>
            <Num style={{ fontSize: 20, lineHeight: 22, fontFamily: F.semibold, color: o.today ? "#fff" : C.ink }}>{pad(o.d)}</Num>
            <T style={{ fontSize: 11, lineHeight: 12.1, fontFamily: F.semibold, letterSpacing: 0.44, color: o.today ? "#fff" : C.ink }}>{WD[wdOct(o.d)]}</T>
          </View>
        </View>
        {i.leave ? <View style={{ flex: 2 }}><T style={{ fontSize: 14, fontFamily: F.medium, color: C.violet }}>Nghỉ phép năm</T></View> : <>
          <View style={{ flex: 1 }}>{tm(i.in, i.inOk, i.flagIn, "arIn")}</View>
          <View style={{ flex: 1 }}>{tm(i.out, i.outOk, i.flagOut, "arOut")}</View>
        </>}
        <View style={styles.hrs}>
          <Num style={{ fontSize: 15, fontFamily: F.medium, color: hrsColor }}>{i.hrs != null ? gh(i.hrs) : i.leave ? "08:00" : "--:--"}</Num>
          <Ic n="chevR" s={16} w={2} color={C.ink3} />
        </View>
      </View>
      {i.note || canEx ? (
        <View style={styles.noteL}>
          {i.note ? <St s={i.note[1] as "ok"}>{i.note[0]}</St> : null}
          {canEx ? <Pressable onPress={() => ACT.exFromDay(String(o.d))} style={styles.exBtn}><T style={{ fontSize: 12, fontFamily: F.semibold, color: "#fff" }}>Giải trình</T></Pressable> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function attendanceSpec(): ScreenSpec {
  const fixed = S.shift === "fixed";
  if (S.attFilter === "late" && !fixed) S.attFilter = "all";
  const f = S.attFilter;
  const lateDays = S.oct.filter((o) => fixed && o.in && o.out && toMin(o.in) > 480);
  const missDays = S.oct.filter((o) => !o.today && !o.leave && (!o.in || !o.out));
  const missOpen = missDays.filter((o) => !o.explained && !o.pendingEx).length;
  const left = explainLeft();
  const rows: React.ReactElement[] = [];
  if (f === "all") {
    for (let d = 16; d >= 1; d--) {
      const wd = wdOct(d);
      if (wd === 0) { rows.push(<View key={`wk${d}`} style={styles.wk}><T style={{ fontSize: 13.5, color: C.ink2, textAlign: "center" }}>Cuối tuần: {pad(d)} Chủ Nhật & {pad(d - 1)} Thứ Bảy</T></View>); continue; }
      if (wd === 6) continue;
      rows.push(<ArRow key={d} o={day(d) || { d }} first={!rows.length || rows[rows.length - 1]?.key?.toString().startsWith("wk")} />);
    }
  } else {
    const list = (f === "late" ? lateDays : missDays).slice().sort((a, b) => b.d - a.d);
    list.forEach((o, i) => rows.push(<ArRow key={o.d} o={o} filtered first={i === 0} />));
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
