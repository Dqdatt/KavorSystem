import { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { C, EASE, F, GL, glass, tint } from "../theme";
import { Gi, Ic } from "../icons";
import { Appear } from "../motion";
import { Btn, Card, Chip, Chips, Empty, ErrLine, Field, Form, InfoRow, Note, Num, RowBtn, SectionHead, Seg, Stepper, T, Tag, TextArea } from "../ui";
import { Foot, TopBar, type ScreenSpec } from "../screen";
import { LV_DAYS, WD, dec, hm, lvKey, pad, wdOct } from "../data";
import { REMOTE } from "../api/http";
import { ACT, S, WD_ISO, day, ddmm, emit, exPick, explainLeft, go, issueText, lvAvail, lvCount, monthTitle, tsDay } from "../store";

const Spacer = () => <View style={{ height: 76 }} />;

/* Giải trình từ bảng công thật: ngày còn hạn, lý do theo bất thường của ngày, người duyệt theo luồng của công ty */
function remoteExplainSpec(): ScreenSpec {
  const t = S.ts, q = t?.explanation, e = S.ex;
  const head = <TopBar title="Giải trình công" />;
  if (!t || !q) return { head, body: [<Empty key="e" icon={<Gi n="hour" s={44} />} title={t ? "Chưa áp dụng quy định giải trình" : "Chưa tải được bảng công"} text={t ? "Liên hệ phòng Nhân sự để được hướng dẫn." : "Kiểm tra kết nối mạng rồi mở lại Bảng công."} />] };
  if (t.period.locked) return { head, body: [<Empty key="e" icon={<Gi n="hour" s={44} />} title={`Kỳ công ${monthTitle(t.period.month).toLowerCase()} đã khóa`} text="Liên hệ phòng Nhân sự nếu còn ngày công cần điều chỉnh." />] };
  if (q.left <= 0) return { head, body: [<Empty key="e" icon={<Gi n="hour" s={44} />} title={`Đã dùng hết ${q.limit} lượt kỳ này`} text="Liên hệ phòng Nhân sự nếu còn ngày công cần điều chỉnh." />] };
  const opts = t.days.filter((d) => d.canExplain).slice().reverse();
  if (opts.length && !opts.find((d) => d.date === S.exDay)) exPick(opts[0]!.date);
  const d = S.exDay ? tsDay(S.exDay) : undefined;
  const iss = d?.issue;
  /* Quên chấm/đến muộn/về sớm sửa một giờ; vắng cả ngày ghi nhận theo giờ ca */
  const types: Array<[string, string]> = [
    ...(iss === "missing_in" || iss === "late" || iss === "late_early" ? [["in", iss === "missing_in" ? "Quên chấm vào" : "Đến muộn có lý do"] as [string, string]] : []),
    ...(iss === "missing_out" || iss === "early" || iss === "late_early" ? [["out", iss === "missing_out" ? "Quên chấm ra" : "Về sớm có lý do"] as [string, string]] : []),
    ["trip", "Đi công tác"], ["device", "Lỗi thiết bị/GPS"], ["other", "Khác"],
  ];
  const outSide = e.type === "out" || (e.type !== "in" && (iss === "missing_out" || iss === "early"));
  const whole = iss === "absent" && e.type !== "in" && e.type !== "out";
  const dl = d?.explainDeadline;
  return {
    head,
    body: [
      <Note key="n" icon="hour" warn><T style={{ fontSize: 13, color: C.ink2 }}><T style={{ fontSize: 13, fontFamily: F.bold, color: C.ink }}>Lượt {q.used + 1}/{q.limit}{dl ? ` · hạn ${ddmm(dl)}` : ""}</T>{"\n"}Sau khi gửi còn {q.left - 1} lượt trong kỳ công {ddmm(t.period.start)}–{ddmm(t.period.end)}.</T></Note>,
      <Form key="f">
        <Field label="Ngày cần giải trình">
          <Chips wrap>{opts.length ? opts.map((x) => <Chip key={x.date} on={S.exDay === x.date} label={`${WD_ISO[x.weekday]} ${ddmm(x.date)} · ${issueText(x)}`} onPress={() => ACT.exDate(x.date)} />) : <T style={{ color: C.ink2 }}>Không còn ngày nào cần giải trình.</T>}</Chips>
        </Field>
        {d ? <Field label="Lý do">
          <Chips wrap>{types.map((x) => <Chip key={x[0]} on={e.type === x[0]} label={x[1]} onPress={() => ACT.exType(x[0])} />)}</Chips>
        </Field> : null}
        {d ? <Field label={whole ? "Giờ đề nghị ghi nhận" : `Giờ đề nghị ghi nhận ${outSide ? "ra ca" : "vào ca"}`}>
          {whole ? <Card><InfoRow k={d.shift?.name ?? "Theo ca"} v={d.shift ? `${d.shift.start} – ${d.shift.end}` : "—"} strong /></Card>
            : <Stepper value={hm(e.time * 60)} minusLabel="Giảm 5 phút" plusLabel="Tăng 5 phút" onMinus={() => ACT.exTime(-5)} onPlus={() => ACT.exTime(5)} />}
        </Field> : null}
        <Field label="Mô tả">
          <TextArea accessibilityLabel="Mô tả" defaultValue={e.reason} placeholder="Ví dụ: Điện thoại hết pin lúc đến công ty, bảo vệ đã xác nhận giờ vào."
            onChangeText={(v) => { S.ex.reason = v; if (S.ex.err && v.trim()) { S.ex.err = false; emit(); } }} />
          {e.err ? <ErrLine>Nhập mô tả để người duyệt có đủ thông tin xét duyệt.</ErrLine> : null}
        </Field>
        <Field label="Minh chứng (không bắt buộc)">
          <View style={[styles.upload, { opacity: 0.55 }]}><Gi n="clip" s={20} /><T style={{ fontSize: 13.5, color: C.ink2, flex: 1 }}>Đính kèm ảnh/PDF sẽ có ở bản sau</T></View>
        </Field>
        <Card><InfoRow k="Người duyệt" v={t.approver ?? "Phòng Nhân sự"} strong /></Card>
      </Form>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={!opts.length} spinKey="exSubmit" onPress={ACT.exSubmit}>Gửi giải trình</Btn></Foot>,
  };
}

export function explainSpec(): ScreenSpec {
  if (REMOTE) return remoteExplainSpec();
  const left = explainLeft(), e = S.ex;
  const opts = ([[15, "thiếu giờ vào"], [12, "muộn 14 phút"], [5, "muộn 21 phút"]] as Array<[number, string]>).filter((x) => !day(x[0])?.pendingEx);
  if (!opts.find((x) => x[0] === e.date) && opts.length) e.date = opts[0]![0];
  const types: Array<[string, string]> = [["in", "Quên chấm vào"], ["out", "Quên chấm ra"], ["trip", "Đi công tác"], ["device", "Lỗi thiết bị/GPS"], ["other", "Khác"]];
  if (left <= 0) return { head: <TopBar title="Giải trình công" />, body: [<Empty key="e" icon={<Gi n="hour" s={44} />} title="Đã dùng hết 3 lượt tháng 10" text="Liên hệ phòng Nhân sự nếu còn ngày công cần điều chỉnh." />] };
  return {
    head: <TopBar title="Giải trình công" />,
    body: [
      <Note key="n" icon="hour" warn><T style={{ fontSize: 13, color: C.ink2 }}><T style={{ fontSize: 13, fontFamily: F.bold, color: C.ink }}>Lượt {S.explainUsed + 1}/3 · hạn 22/10</T>{"\n"}Sau khi gửi còn {left - 1} lượt trong tháng 10.</T></Note>,
      <Form key="f">
        <Field label="Ngày cần giải trình">
          <Chips wrap>{opts.length ? opts.map((x) => <Chip key={x[0]} on={e.date === x[0]} label={`${pad(x[0])}/10 · ${x[1]}`} onPress={() => ACT.exDate(x[0])} />) : <T style={{ color: C.ink2 }}>Không còn ngày nào cần giải trình.</T>}</Chips>
        </Field>
        <Field label="Lý do">
          <Chips wrap>{types.map((t) => <Chip key={t[0]} on={e.type === t[0]} label={t[1]} onPress={() => ACT.exType(t[0])} />)}</Chips>
        </Field>
        <Field label={`Giờ đề nghị ghi nhận ${e.type === "out" ? "ra ca" : "vào ca"}`}>
          <Stepper value={hm(e.time * 60)} minusLabel="Giảm 5 phút" plusLabel="Tăng 5 phút" onMinus={() => ACT.exTime(-5)} onPlus={() => ACT.exTime(5)} />
        </Field>
        <Field label="Mô tả">
          <TextArea accessibilityLabel="Mô tả" defaultValue={e.reason} placeholder="Ví dụ: Điện thoại hết pin lúc đến công ty, bảo vệ đã xác nhận giờ vào."
            onChangeText={(t) => { S.ex.reason = t; if (S.ex.err && t.trim()) { S.ex.err = false; emit(); } }} />
          {e.err ? <ErrLine>Nhập mô tả để quản lý có đủ thông tin xét duyệt.</ErrLine> : null}
        </Field>
        <Field label="Minh chứng (không bắt buộc)">
          {e.file ? (
            <Appear style={[glass, styles.file]}>
              <Gi n="clip" s={20} />
              <T numberOfLines={1} style={{ flex: 1, fontSize: 13, fontFamily: F.medium }}>{e.file}</T>
              <Pressable accessibilityLabel="Bỏ tệp" onPress={ACT.exFile} hitSlop={8}><Ic n="x" s={18} /></Pressable>
            </Appear>
          ) : (
            <Pressable onPress={ACT.exFile} style={styles.upload}><Gi n="clip" s={20} /><T style={{ fontSize: 13.5, color: C.ink2, flex: 1 }}>Thêm ảnh hoặc PDF, tối đa 5 MB</T></Pressable>
          )}
        </Field>
        <Card><InfoRow k="Người duyệt" v="Lê Quang Huy" strong /></Card>
      </Form>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={!opts.length} onPress={ACT.exSubmit}>Gửi giải trình</Btn></Foot>,
  };
}

function Meter({ pct }: { pct: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 700, easing: EASE, useNativeDriver: true }).start(); }, []);
  return (
    <View style={{ height: 8, borderRadius: 8, backgroundColor: "#DCEBE4", overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: "100%" }}>
        <Animated.View style={{ flex: 1, borderRadius: 8, experimental_backgroundImage: GL.gIn, transformOrigin: "left", transform: [{ scaleX: v }] }} />
      </View>
    </View>
  );
}

export function leaveSpec(): ScreenSpec {
  const L = S.leave, total = L.granted + L.carry, av = lvAvail(), remain = Math.round((av / total) * 100);
  const mine = S.myReq.filter((r) => r.type === "leave");
  return {
    head: <TopBar title="Nghỉ phép" />,
    body: [
      <View key="b" style={styles.balance} accessibilityLabel="Số dư phép năm 2026">
        <View pointerEvents="none" style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, right: -48, top: -58, backgroundColor: "rgba(167,243,208,0.24)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Gi n="plane" s={18} w={1.8} /><T style={{ fontSize: 12, fontFamily: F.bold, color: C.emerald }}>Phép năm 2026</T></View>
          <View style={{ paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.72)" }}><T style={{ fontSize: 10.5, lineHeight: 13, fontFamily: F.semibold, color: C.ink2 }}>Cập nhật hôm nay</T></View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginTop: 15, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
            <Num style={{ fontSize: 43, lineHeight: 43, fontFamily: F.medium, letterSpacing: -1.72, color: "#123D30" }}>{dec(av)}</Num>
            <T style={{ fontSize: 13, fontFamily: F.semibold, color: C.ink2 }}>ngày còn lại</T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Num style={{ fontSize: 16, lineHeight: 21.6, fontFamily: F.bold }}>{total}</Num>
            <T style={{ fontSize: 11, lineHeight: 14.9, color: C.ink3 }}>ngày khả dụng</T>
          </View>
        </View>
        <Meter pct={remain} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <T style={{ fontSize: 10.5, color: C.ink3 }}>Đã sử dụng và đang chờ: {dec(L.used + L.pending)} ngày</T>
          <T style={{ fontSize: 10.5, color: C.ink3, fontFamily: F.bold }}>{remain}% còn lại</T>
        </View>
        <View style={{ flexDirection: "row", gap: 7, marginTop: 14 }}>
          {([[dec(L.used), "Đã sử dụng"], [dec(L.pending), "Đang chờ duyệt"], [String(total), "Tổng khả dụng"]] as Array<[string, string]>).map(([b, s]) => (
            <View key={s} style={styles.stat}><Num style={{ fontSize: 13, fontFamily: F.bold }}>{b}</Num><T numberOfLines={1} style={{ fontSize: 9.5, color: C.ink3 }}>{s}</T></View>
          ))}
        </View>
      </View>,
      <Card key="c"><InfoRow k="Được cấp năm 2026" v="12 ngày" strong /><InfoRow k="Tồn từ 2025" v="2 ngày · đến 31/03/2027" strong /></Card>,
      <Note key="n" icon="info">Hạn dùng phép tồn do công ty cấu hình. Ngày giữ chỗ được trả lại nếu đơn bị từ chối hoặc hủy.</Note>,
      <SectionHead key="sh" title="Đơn nghỉ của tôi" />,
      <Card key="list">{mine.map((r) => <RowBtn key={r.id} chev={false} title={r.sub.split(" · ")[0]} sub={r.sub.split(" · ").slice(1).join(" · ")} right={<Tag st={r.status} />} onPress={() => { S.param = r.id; go("reqDetail"); }} />)}</Card>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block onPress={() => go("leaveNew")}>Tạo đơn nghỉ</Btn></Foot>,
  };
}

export function leaveNewSpec(): ScreenSpec {
  const v = S.lv, n = lvCount(), av = lvAvail(), deduct = v.type === "annual";
  const single = v.from != null && (v.to == null || v.to === v.from);
  const over = deduct && n > av;
  const types: Array<[string, string]> = [["annual", "Phép năm"], ["unpaid", "Không lương"], ["wedding", "Kết hôn"], ["bereave", "Tang chế"], ["sick", "Ốm đau (BHXH)"]];
  return {
    head: <TopBar title="Tạo đơn nghỉ" />,
    body: [
      <Form key="f">
        <Field label="Loại nghỉ"><Chips>{types.map((t) => <Chip key={t[0]} on={v.type === t[0]} label={t[1]} onPress={() => ACT.lvType(t[0])} />)}</Chips></Field>
        <Field label="Chạm ngày bắt đầu, rồi ngày kết thúc">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, overflow: "visible" }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 8 }}>
            {LV_DAYS.map((x) => {
              const k = lvKey(x), off = x.wd === 0 || x.wd === 6, to = v.to ?? v.from;
              const st = v.from == null ? "" : (k === v.from || k === to) ? "edge" : (k > v.from && k < (to ?? 0)) ? "in" : "";
              return (
                <Pressable key={k} disabled={off} onPress={() => ACT.lvPick(k)} style={[styles.dp, off && styles.dpOff, st === "in" && { backgroundColor: C.soft2, experimental_backgroundImage: undefined }, st === "edge" && styles.dpEdge]}>
                  <T style={{ fontSize: 11, fontFamily: F.semibold, color: st === "edge" ? "rgba(255,255,255,0.85)" : C.ink3 }}>{WD[x.wd]}</T>
                  <Num style={{ fontSize: 19, fontFamily: F.semibold, color: st === "edge" ? "#fff" : C.ink }}>{pad(x.d)}</Num>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>
        {single ? <Appear><Field label="Buổi"><Seg items={[["full", "Cả ngày"], ["am", "Sáng"], ["pm", "Chiều"]]} value={v.half} onChange={ACT.lvHalf} /></Field></Appear> : null}
        <Field label="Lý do"><TextArea accessibilityLabel="Lý do" defaultValue={v.reason} placeholder="Ví dụ: Việc gia đình" onChangeText={(t) => { S.lv.reason = t; }} /></Field>
        {over ? <ErrLine>Không đủ phép: còn {dec(av)} ngày, đơn cần {dec(n)} ngày.</ErrLine> : null}
        <Card>
          <InfoRow k="Số ngày nghỉ" v={n ? dec(n) + " ngày" : "Chưa chọn"} strong />
          <InfoRow k={deduct ? "Còn lại sau đơn" : "Trừ phép năm"} v={deduct ? (n ? dec(av - n) + " ngày" : "—") : "Không trừ"} strong />
          <InfoRow k="Người duyệt" v="Lê Quang Huy" strong />
        </Card>
        {v.err ? <ErrLine>{v.err}</ErrLine> : null}
      </Form>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={over || !n} onPress={ACT.lvSubmit}>Gửi đơn nghỉ</Btn></Foot>,
  };
}

export function otSpec(): ScreenSpec {
  const o = S.ot, h = (o.to - o.from) / 60, dates = [16, 19, 20, 21, 22];
  const clash = S.shift === "fixed" && S.sh.assigned && o.from < S.sh.end;
  return {
    head: <TopBar title="Làm thêm giờ" />,
    body: [
      <Form key="f">
        <Field label="Ngày"><Chips>{dates.map((d) => <Chip key={d} on={o.date === d} label={`${WD[wdOct(d)]} ${pad(d)}/10`} onPress={() => ACT.otDate(d)} />)}</Chips></Field>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Từ"><Stepper value={hm(o.from * 60)} minusLabel="Lùi 30 phút" plusLabel="Thêm 30 phút" onMinus={() => ACT.otT("from", -30)} onPlus={() => ACT.otT("from", 30)} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Đến"><Stepper value={hm(o.to * 60)} minusLabel="Lùi 30 phút" plusLabel="Thêm 30 phút" onMinus={() => ACT.otT("to", -30)} onPlus={() => ACT.otT("to", 30)} /></Field></View>
        </View>
        {clash ? <ErrLine>Trùng giờ ca chính. {S.sh.name} kết thúc {hm(S.sh.end * 60)}.</ErrLine> : null}
        <Card><InfoRow k="Tổng giờ" v={dec(h) + " giờ"} strong /><InfoRow k="Hệ số" v="150% · ngày thường" strong /><InfoRow k="Người duyệt" v="Lê Quang Huy" strong /></Card>
        <Field label="Công việc"><TextArea accessibilityLabel="Công việc" defaultValue={o.reason} placeholder="Ví dụ: Hoàn thiện key visual chiến dịch" onChangeText={(t) => { S.ot.reason = t; }} /></Field>
      </Form>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={clash || h <= 0} onPress={ACT.otSubmit}>Gửi đăng ký</Btn></Foot>,
  };
}

const styles = StyleSheet.create({
  file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, width: "100%" },
  upload: { borderWidth: 1.5, borderStyle: "dashed", borderColor: C.line2, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 10, width: "100%", experimental_backgroundImage: GL.fill, boxShadow: GL.sh },
  balance: { overflow: "hidden", padding: 18, borderRadius: 24, experimental_backgroundImage: "linear-gradient(145deg, #EAF8F1 0%, #FAFCFB 66%, #FFF7E7 100%)", borderWidth: 1, borderColor: "rgba(6,95,70,0.09)", boxShadow: "0px 18px 38px -30px rgba(6,70,50,0.55)" },
  stat: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.68)", borderWidth: 1, borderColor: "rgba(6,95,70,0.06)", gap: 2 },
  dp: { ...glass, width: 52, height: 68, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 2 },
  dpOff: { opacity: 0.35, boxShadow: undefined, backgroundColor: C.soft, experimental_backgroundImage: undefined },
  dpEdge: { ...tint },
});
