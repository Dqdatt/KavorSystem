import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { C, F } from "../theme";
import { Gi, Ic } from "../icons";
import { Btn, BtnRow, Card, Chip, Chips, ErrLine, Field, InfoRow, LinkBtn, Ln, Note, Num, Row, RowBtn, RowStrong, SecT, SectionHead, Spinner, St, T, TbBtn, TextArea, Timeline } from "../ui";
import { Foot, TopBar, type ScreenSpec } from "../screen";
import { advLimit, dec, groupThousands, netPay, sum, vnd } from "../data";
import { ACT, ADV_DAY, ADV_STEPS, S, advEligible, advError, emit, go, money, stamp } from "../store";
import { REMOTE } from "../api/http";
import { QA_ENABLED } from "../qa";
import type { RequestItem } from "@kavor/contracts";

const EyeBtn = () => <TbBtn label="Ẩn hoặc hiện số tiền" onPress={ACT.hideMoney}><Ic n={S.hideMoney ? "eyeOff" : "eye"} s={20} /></TbBtn>;
const Cap = ({ children }: { children: string }) => <T style={{ textAlign: "center", color: C.ink2, fontSize: 13, fontFamily: F.medium }}>{children}</T>;
const Amt = ({ children, mt = 6, muted }: { children: string; mt?: number; muted?: boolean }) => <Num style={{ fontSize: 40, lineHeight: 44, fontFamily: F.light, letterSpacing: -0.8, color: muted ? C.ink3 : C.hero, textAlign: "center", marginTop: mt }}>{children}</Num>;
const Fine = ({ children, style }: { children: string; style?: object }) => <T style={[{ color: C.ink3, fontSize: 12, textAlign: "center", marginTop: 4 }, style]}>{children}</T>;
const Spacer = () => <View style={{ height: 76 }} />;

export function payslipsSpec(): ScreenSpec {
  if (REMOTE || (QA_ENABLED && S.payrollData)) return remotePayslipsSpec();
  return {
    head: <TopBar title="Phiếu lương" right={<EyeBtn />} />,
    body: [
      <View key="top" style={{ paddingTop: 8 }}><Cap>Thực lĩnh tháng 09/2026</Cap><Amt>{money(netPay(S.payslips[0]!))}</Amt><Fine>Công bố 05/10 · đã chuyển khoản 05/10</Fine></View>,
      <Card key="list">
        {S.payslips.map((p, i) => <RowBtn key={p.k} icon={<Gi n="receipt" s={24} />} title={`Tháng ${p.k}`} sub={`Công bố ${p.pub}`} right={<RowStrong>{money(netPay(p))}</RowStrong>} onPress={() => { S.param = String(i); go("payslip"); }} />)}
        <Row><Ic n="hour" s={24} w={1.6} /><View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold, color: C.ink3 }}>Tháng 10/2026</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>Chưa công bố · dự kiến 05/11</T></View></Row>
      </Card>,
      <Note key="n" icon="lock">Đã xác thực trong 5 phút. Sau đó app hỏi lại PIN hoặc Face ID.</Note>,
    ],
  };
}

export function payslipSpec(): ScreenSpec {
  if (REMOTE || (QA_ENABLED && S.payslipData)) return remotePayslipSpec();
  const p = S.payslips[+(S.param ?? 0) || 0] ?? S.payslips[0]!;
  return {
    head: <TopBar title={"Tháng " + p.k} right={<EyeBtn />} />,
    body: [
      <View key="top"><Cap>Thực lĩnh</Cap><Amt mt={4}>{money(netPay(p))}</Amt><Fine>{`${p.work} ngày công · Vietcombank •6789`}</Fine></View>,
      <Card key="c" pad>
        <SecT>Thu nhập</SecT>
        {p.income.map((x) => <Ln key={x[0]} k={x[0]} sub={x[2]} v={money(x[1])} />)}
        <Ln k="Tổng thu nhập" v={money(sum(p.income))} kind="tot" />
        <SecT style={{ marginTop: 18 }}>Khấu trừ</SecT>
        {p.deduct.map((x) => <Ln key={x[0]} k={x[0]} sub={x[2]} v={"−" + money(x[1])} vStyle={{ color: C.bad }} />)}
        <Ln k="Tổng khấu trừ" v={"−" + money(sum(p.deduct))} kind="tot" vStyle={{ color: C.bad }} />
        <Ln k="Thực lĩnh" v={money(netPay(p))} kind="net" />
      </Card>,
      <Fine key="f" style={{ marginTop: 0 }}>{`Công bố ${p.pub} · chuyển khoản ${p.paid}`}</Fine>,
      <BtnRow key="b">
        <Btn kind="ghost" sm icon={<Gi n="download" s={18} />} onPress={() => ACT.toast(`Đã tải Phieu-luong-${p.k.replace("/", "-")}.pdf (mô phỏng). Mật khẩu file là ngày sinh của bạn.`)}>Tải PDF</Btn>
        <Btn kind="ghost" sm icon={<Gi n="msg" s={18} />} onPress={() => ACT.askPay(p.k)}>Hỏi HR</Btn>
      </BtnRow>,
    ],
  };
}

/* ---------- Phiếu lương thật: giữ khung prototype, lấy toàn bộ số tiền/nhãn từ API ---------- */
const payMonth = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;
const payDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}`
  : new Date(value).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", ...(S.ts?.timezone ? { timeZone: S.ts.timezone } : {}) });
const payTimeline = (c: import("@kavor/contracts").PayrollCycle) => `Công bố ${c.publishedAt ? payDate(c.publishedAt) : "—"} · ${c.paidAt ? `đã trả ${payDate(c.paidAt)}` : `dự kiến trả ${payDate(c.payDate)}`}`;
function payrollWaiting(error: string): ScreenSpec["body"] {
  return error ? [<Note key="err" icon="info">{error}</Note>, <Btn key="retry" kind="ghost" block onPress={ACT.payrollRetry}>Thử lại</Btn>]
    : [<Card key="loading"><Row style={{ justifyContent: "center", gap: 10 }}><Spinner /><T>Đang tải phiếu lương…</T></Row></Card>];
}
function remotePayslipsSpec(): ScreenSpec {
  const data = S.payrollData, latest = data?.items[0];
  const head = <TopBar title="Phiếu lương" right={<EyeBtn />} />;
  if (!data) return { head, body: payrollWaiting(S.payrollError) };
  if (!latest) return { head, body: [<Card key="empty" pad><Cap>Chưa có phiếu lương được công bố</Cap><Fine>Phiếu lương sẽ xuất hiện tại đây sau khi công ty công bố.</Fine></Card>] };
  return { head, body: [
    <View key="top" style={{ paddingTop: 8 }}><Cap>{`Thực lĩnh tháng ${payMonth(latest.cycle.month)}`}</Cap><Amt>{money(latest.net)}</Amt><Fine>{payTimeline(latest.cycle)}</Fine></View>,
    <Card key="list">{data.items.map((p) => <RowBtn key={p.cycle.id} icon={<Gi n="receipt" s={24} />} title={`Tháng ${payMonth(p.cycle.month)}`}
      sub={`Công bố ${p.cycle.publishedAt ? payDate(p.cycle.publishedAt) : "—"}`} right={<RowStrong>{money(p.net)}</RowStrong>}
      onPress={() => { S.param = p.cycle.month; go("payslip"); }} />)}</Card>,
    <Note key="n" icon="lock">Đã xác thực trong 5 phút. Sau đó app hỏi lại PIN hoặc Face ID.</Note>,
  ] };
}
function remotePayslipSpec(): ScreenSpec {
  const data = S.payslipData;
  const month = data?.cycle.month ?? S.param ?? "";
  const head = <TopBar title={month ? `Tháng ${payMonth(month)}` : "Phiếu lương"} right={<EyeBtn />} />;
  if (!data) return { head, body: payrollWaiting(S.payslipError) };
  const p = data.result, c = data.cycle;
  return { head, body: [
    <View key="top"><Cap>Thực lĩnh</Cap><Amt mt={4}>{money(p.net)}</Amt><Fine>{p.workDays === null ? "Chưa cung cấp ngày công" : `${dec(p.workDays)} ngày công`}</Fine></View>,
    <Card key="c" pad>
      <SecT>Thu nhập</SecT>
      {p.items.filter((i) => i.kind === "earning").map((i) => <Ln key={i.id} k={i.label ?? i.name} v={money(i.amount)} />)}
      <Ln k="Tổng thu nhập" v={money(p.gross)} kind="tot" />
      <SecT style={{ marginTop: 18 }}>Khấu trừ</SecT>
      {p.items.filter((i) => i.kind === "deduction").map((i) => <Ln key={i.id} k={i.label ?? i.name} v={"−" + money(i.amount)} vStyle={{ color: C.bad }} />)}
      <Ln k="Tổng khấu trừ" v={"−" + money(p.deduction)} kind="tot" vStyle={{ color: C.bad }} />
      <Ln k="Thực lĩnh" v={money(p.net)} kind="net" />
    </Card>,
    <Fine key="f" style={{ marginTop: 0 }}>{payTimeline(c)}</Fine>,
    p.note ? <Note key="note" icon="info">{p.note}</Note> : null,
    <BtnRow key="b">
      <Btn kind="ghost" sm icon={<Gi n="download" s={18} />} onPress={() => ACT.toast("Tải PDF phiếu lương sẽ có ở bản sau.")}>Tải PDF</Btn>
      <Btn kind="ghost" sm icon={<Gi n="msg" s={18} />} onPress={() => ACT.askPay(payMonth(month))}>Hỏi HR</Btn>
    </BtnRow>,
  ] };
}

/* ---------- Tạm ứng (bản dùng API) ---------- */
type AdvReq = Extract<RequestItem, { type: "salary_advance" }>;
const asAdv = (r: RequestItem | null | undefined) => (r && r.type === "salary_advance" ? r : null);
const mLabel = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
/* Trạng thái đơn tạm ứng: đang duyệt / chờ chi / đã chi / từ chối / đã hủy */
function advState(r: AdvReq): [string, "ok" | "warn" | "bad" | "mute"] {
  if (r.payout) return ["Đã chi", "ok"];
  if (r.status === "approved") return ["Chờ chi", "warn"];
  if (r.status === "pending") return ["Đang duyệt", "warn"];
  return r.status === "rejected" ? ["Từ chối", "bad"] : ["Đã hủy", "mute"];
}

function remoteAdvanceSpec(): ScreenSpec {
  const d = S.advData, el = advEligible(), cur = asAdv(d?.current), p = d?.policy;
  const top = [
    <View key="top" style={{ paddingTop: 8 }}>
      <Cap>{d ? `Hạn mức tạm ứng tháng ${Number(d.month.slice(5))}` : "Hạn mức tạm ứng"}</Cap>
      <Amt muted={!!el}>{el || !d ? "0 ₫" : money(d.limit)}</Amt>
      {p ? <View style={{ alignItems: "center", marginTop: 4 }}><LinkBtn onPress={ACT.advExplain}>{`${p.maxPercent}% × lương cơ bản · cách tính`}</LinkBtn></View> : null}
    </View>,
  ];
  if (el) top.push(<Note key="el" icon="lock"><T style={{ fontSize: 13, color: C.ink2 }}><T style={{ fontSize: 13, fontFamily: F.bold, color: C.ink }}>{el[0]}</T>{"\n"}{el[1]}</T></Note>);
  else if (cur) {
    const [label, tone] = advState(cur);
    top.push(<Card key="a"><RowBtn icon={<Gi n="cash" s={24} />} title={`${cur.no} · ${vnd(cur.payload.amount)}`} sub={`${label} · gửi ${stamp(cur.submittedAt)}`} right={<St s={tone}>{label}</St>} onPress={() => { S.param = cur.no; go("advanceDetail"); }} /></Card>);
    top.push(<Note key="used" icon="info">{`Bạn đã dùng lượt tạm ứng tháng ${Number(d!.month.slice(5))}.`}</Note>);
  } else if (d?.deadlinePassed) top.push(<Note key="dl" icon="info">{`Đã qua hạn nhận đơn tháng ${Number(d.month.slice(5))} (đến hết ngày ${Number(d.deadline!.slice(8))}). Bạn có thể tạm ứng từ tháng sau.`}</Note>);
  const past = (d?.history ?? []).map(asAdv).filter((r): r is AdvReq => !!r && r.id !== cur?.id);
  const daysLeft = d?.deadline && !d.deadlinePassed ? Math.round((Date.parse(`${d.deadline}T00:00:00Z`) - Date.parse(`${d.today}T00:00:00Z`)) / 86_400_000) : null;
  return {
    head: <TopBar title="Tạm ứng lương" />,
    body: [
      ...top,
      p ? <Card key="rules">
        <InfoRow k="Số lần mỗi tháng" v="1 lần" strong />
        <InfoRow k="Hạn nhận đơn" v={d?.deadline ? `Đến hết ngày ${Number(d.deadline.slice(8))}${daysLeft != null ? ` · còn ${daysLeft} ngày` : " · đã qua"}` : "—"} strong />
        <InfoRow k="Duyệt" v={d?.approvers.length ? `${d.approvers.join(" → ")}${d.hrOverAmount ? ` (trên ${vnd(d.hrOverAmount)} thêm HR)` : ""}` : "—"} strong />
        <InfoRow k="Khấu trừ" v="Vào lương tháng ứng" strong />
      </Card> : null,
      <SectionHead key="sh" title="Lịch sử" />,
      past.length ? <Card key="hist">{past.map((r) => {
        const [label, tone] = advState(r);
        return <RowBtn key={r.id} icon={<Gi n="cash" s={24} />} title={`${r.no} · ${vnd(r.payload.amount)}`} sub={r.payout ? `Đã chi ${stamp(r.payout.paidAt)} · trừ lương ${mLabel(r.payload.month)}` : `Trừ lương ${mLabel(r.payload.month)}`} right={<St s={tone}>{label}</St>} onPress={() => { S.param = r.no; go("advanceDetail"); }} />;
      })}</Card> : <Card key="hist"><View style={{ padding: 18 }}><T style={{ color: C.ink2, textAlign: "center" }}>Chưa có lần tạm ứng nào.</T></View></Card>,
      <Spacer key="sp" />,
    ],
    foot: d && !el && !cur && !d.deadlinePassed ? <Foot><Btn block onPress={() => go("advanceNew")}>Tạo đề nghị tạm ứng</Btn></Foot> : undefined,
  };
}

function remoteAdvanceNewSpec(): ScreenSpec {
  const d = S.advData, err = advError(), lim = d?.limit ?? 0, min = d?.policy?.minAmount ?? 500000;
  const quick = [1000000, 2000000, 3000000].filter((x) => x >= min && x < lim);
  return {
    head: <TopBar title="Đề nghị tạm ứng" />,
    body: [
      <View key="amt" style={{ alignItems: "center", paddingTop: 8 }}>
        <Cap>Số tiền muốn ứng</Cap>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, paddingVertical: 8, width: "100%" }}>
          <TextInput accessibilityLabel="Số tiền tạm ứng" allowFontScaling={false} keyboardType="number-pad" value={S.advAmt ? groupThousands(S.advAmt) : ""}
            onChangeText={(t) => { S.advAmt = parseInt(t.replace(/\D/g, ""), 10) || 0; emit(); }}
            style={{ flexShrink: 1, minWidth: 40, textAlign: "center", fontSize: 42, fontFamily: F.light, color: C.hero, padding: 0, fontVariant: ["tabular-nums"] }} />
          <T style={{ fontSize: 20, color: C.ink3 }}>₫</T>
        </View>
        {err ? <ErrLine center>{err}</ErrLine> : <T style={{ color: C.ink3, fontSize: 12 }}>Tối đa {vnd(lim)}</T>}
      </View>,
      <Chips key="q" wrap style={{ justifyContent: "center" }}>
        {[...quick.map((x) => [x, `${x / 1e6} triệu`] as [number, string]), [lim, "Tối đa"] as [number, string]].map(([x, l]) => <Chip key={l} label={l} on={S.advAmt === x} onPress={() => ACT.advQuick(x)} />)}
      </Chips>,
      <Field key="r" label="Lý do (không bắt buộc)"><TextArea accessibilityLabel="Lý do" defaultValue={S.advReason} placeholder="Ví dụ: Chi phí y tế" onChangeText={(t) => { S.advReason = t; }} /></Field>,
      <Card key="c">
        <InfoRow k="Nhận vào" v="Tài khoản nhận lương" strong />
        <InfoRow k="Trừ vào" v={d ? `Lương tháng ${mLabel(d.month)}` : "—"} strong />
        <InfoRow k="Người duyệt" v={d?.approvers.length ? `${d.approvers.join(" → ")}${d.hrOverAmount && S.advAmt > d.hrOverAmount ? " (thêm HR)" : ""}` : "—"} strong />
      </Card>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={!!err} onPress={ACT.advReview}>Tiếp tục</Btn></Foot>,
  };
}

function remoteAdvanceDetailSpec(): ScreenSpec {
  const d = S.advData, r = asAdv([...(d?.current ? [d.current] : []), ...(d?.history ?? [])].find((x) => x.no === S.param) ?? d?.current);
  if (!r) return remoteAdvanceSpec();
  const [label, tone] = advState(r);
  const steps: Array<[string, string]> = [["Đã gửi", stamp(r.submittedAt)],
    ...r.steps.filter((s) => s.status !== "skipped").map((s): [string, string] => [s.resolver === "payroll" ? "Kế toán duyệt" : s.resolver === "hr" ? "HR duyệt" : "Quản lý duyệt",
      s.actedAt ? `${s.actedBy ?? s.assignee ?? ""} · ${stamp(s.actedAt)}${s.comment ? ` · “${s.comment}”` : ""}` : s.assignee ?? "—"]),
    ["Đã chi", r.payout ? `${stamp(r.payout.paidAt)}${r.payout.note ? ` · ${r.payout.note}` : ""}` : "Vào tài khoản nhận lương"],
    ["Khấu trừ", `Lương tháng ${mLabel(r.payload.month)}`]];
  const active = r.steps.filter((s) => s.status !== "skipped");
  const k = active.findIndex((s) => s.status === "pending" || s.status === "rejected" || s.status === "cancelled");
  const cur = r.status === "approved" ? (r.payout ? steps.length - 1 : steps.length - 2) : k < 0 ? 1 : k + 1;
  return {
    head: <TopBar title={r.no} />,
    body: [
      <View key="top" style={{ paddingTop: 8 }}>
        <Cap>Số tiền tạm ứng</Cap><Amt>{vnd(r.payload.amount)}</Amt>
        <View style={{ alignItems: "center", marginTop: 6 }}><St s={tone}>{label}</St></View>
      </View>,
      <Card key="tl" pad><Timeline steps={steps} cur={cur} fail={r.status === "rejected" || r.status === "cancelled"} /></Card>,
      <Card key="c"><InfoRow k="Lý do" v={r.payload.reason || "—"} strong /><InfoRow k="Trừ vào" v={`Lương tháng ${mLabel(r.payload.month)}`} strong /></Card>,
      r.canCancel ? <Btn key="x" kind="danger" block onPress={ACT.advCancel}>Hủy đề nghị</Btn> : null,
    ],
  };
}

export function advanceSpec(): ScreenSpec {
  if (REMOTE) return remoteAdvanceSpec();
  const el = advEligible(), a = S.advance, lim = advLimit();
  const top = [
    <View key="top" style={{ paddingTop: 8 }}>
      <Cap>Hạn mức tạm ứng tháng 10</Cap>
      <Amt muted={!!el}>{el ? "0 ₫" : money(lim)}</Amt>
      <View style={{ alignItems: "center", marginTop: 4 }}><LinkBtn onPress={ACT.advExplain}>30% × lương cơ bản · cách tính</LinkBtn></View>
    </View>,
  ];
  if (el) top.push(<Note key="el" icon="lock"><T style={{ fontSize: 13, color: C.ink2 }}><T style={{ fontSize: 13, fontFamily: F.bold, color: C.ink }}>{el[0]}</T>{"\n"}{el[1]}</T></Note>);
  else if (a) {
    top.push(<Card key="a"><RowBtn icon={<Gi n="cash" s={24} />} title={`${a.id} · ${vnd(a.amount)}`} sub={`${ADV_STEPS[a.step]} · gửi ${a.created}`} right={a.step >= 4 ? <St s="ok">Đã chi</St> : <St s="warn">Đang duyệt</St>} onPress={() => go("advanceDetail")} /></Card>);
    top.push(<Note key="used" icon="info">Bạn đã dùng lượt tạm ứng tháng 10.</Note>);
  }
  return {
    head: <TopBar title="Tạm ứng lương" />,
    body: [
      ...top,
      <Card key="rules"><InfoRow k="Số lần mỗi tháng" v="1 lần" strong /><InfoRow k="Hạn nhận đơn" v={`Trước ngày ${ADV_DAY} · còn ${ADV_DAY - 16} ngày`} strong /><InfoRow k="Duyệt" v="Quản lý → HR → Kế toán" strong /><InfoRow k="Khấu trừ" v="Vào lương tháng ứng" strong /></Card>,
      <SectionHead key="sh" title="Lịch sử" />,
      <Card key="hist">
        <Row><Gi n="cash" s={24} /><View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold }}>TU-0912 · 3.000.000 ₫</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>Đã trừ vào lương 09/2026</T></View><St s="ok">Hoàn tất</St></Row>
        <Row><Gi n="cash" s={24} /><View style={{ flex: 1 }}><T style={{ fontFamily: F.semibold }}>TU-0710 · 2.500.000 ₫</T><T style={{ color: C.ink2, fontSize: 12.5, marginTop: 2 }}>Đã trừ vào lương 07/2026</T></View><St s="ok">Hoàn tất</St></Row>
      </Card>,
      <Spacer key="sp" />,
    ],
    foot: !el && !a ? <Foot><Btn block onPress={() => go("advanceNew")}>Tạo đề nghị tạm ứng</Btn></Foot> : undefined,
  };
}

export function advanceNewSpec(): ScreenSpec {
  if (REMOTE) return remoteAdvanceNewSpec();
  const lim = advLimit(), err = advError();
  return {
    head: <TopBar title="Đề nghị tạm ứng" />,
    body: [
      <View key="amt" style={{ alignItems: "center", paddingTop: 8 }}>
        <Cap>Số tiền muốn ứng</Cap>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, paddingVertical: 8, width: "100%" }}>
          <TextInput accessibilityLabel="Số tiền tạm ứng" allowFontScaling={false} keyboardType="number-pad" value={S.advAmt ? groupThousands(S.advAmt) : ""}
            onChangeText={(t) => { S.advAmt = parseInt(t.replace(/\D/g, ""), 10) || 0; emit(); }}
            style={{ flexShrink: 1, minWidth: 40, textAlign: "center", fontSize: 42, fontFamily: F.light, color: C.hero, padding: 0, fontVariant: ["tabular-nums"] }} />
          <T style={{ fontSize: 20, color: C.ink3 }}>₫</T>
        </View>
        {err ? <ErrLine center>{err}</ErrLine> : <T style={{ color: C.ink3, fontSize: 12 }}>Tối đa {vnd(lim)}</T>}
      </View>,
      <Chips key="q" wrap style={{ justifyContent: "center" }}>
        {[1000000, 2000000, 3000000, lim].map((x, i) => <Chip key={i} label={i === 3 ? "Tối đa" : `${x / 1e6} triệu`} onPress={() => ACT.advQuick(x)} />)}
      </Chips>,
      <Field key="r" label="Lý do (không bắt buộc)"><TextArea accessibilityLabel="Lý do" defaultValue={S.advReason} placeholder="Ví dụ: Chi phí y tế" onChangeText={(t) => { S.advReason = t; }} /></Field>,
      <Card key="c"><InfoRow k="Nhận vào" v="Vietcombank •6789" strong /><InfoRow k="Trừ vào" v="Lương 10/2026, trả 05/11" strong /><InfoRow k="Thực lĩnh dự kiến" v={err ? "—" : vnd(15817500 - S.advAmt)} strong /></Card>,
      <Spacer key="sp" />,
    ],
    foot: <Foot><Btn block disabled={!!err} onPress={ACT.advReview}>Tiếp tục</Btn></Foot>,
  };
}

export function advanceDetailSpec(): ScreenSpec {
  if (REMOTE) return remoteAdvanceDetailSpec();
  const a = S.advance;
  if (!a) return advanceSpec();
  const steps: Array<[string, string]> = [["Đã gửi", a.created], ["Quản lý duyệt", "Lê Quang Huy"], ["HR duyệt", "Mai Phương Thảo"], ["Kế toán duyệt", "Đỗ Hồng Nhung"], ["Đã chi", "Vào Vietcombank •6789"], ["Đã khấu trừ", "Lương 10/2026"]];
  return {
    head: <TopBar title={a.id} />,
    body: [
      <View key="top" style={{ paddingTop: 8 }}>
        <Cap>Số tiền tạm ứng</Cap><Amt>{vnd(a.amount)}</Amt>
        <View style={{ alignItems: "center", marginTop: 6 }}>{a.step >= 5 ? <St s="ok">Hoàn tất</St> : a.step >= 4 ? <St s="ok">Đã chi, chờ khấu trừ</St> : <St s="warn">Đang chờ duyệt</St>}</View>
      </View>,
      <Card key="tl" pad><Timeline steps={steps} cur={a.step} allDone={a.step === 5} /></Card>,
      <Card key="c"><InfoRow k="Lý do" v={a.reason || "—"} strong /><InfoRow k="Trừ vào" v="Lương 10/2026" strong /></Card>,
      a.step === 1 ? <Btn key="x" kind="danger" block onPress={ACT.advCancel}>Hủy đề nghị</Btn> : null,
      a.step < 5 ? <Pressable key="p" onPress={ACT.advStep} style={styles.proto}><T style={{ color: C.ink2, fontSize: 12.5, textAlign: "center" }}>Mô phỏng: chuyển sang bước tiếp theo</T></Pressable> : null,
    ],
  };
}

const styles = StyleSheet.create({
  proto: { borderWidth: 1.5, borderStyle: "dashed", borderColor: C.line2, borderRadius: 16, padding: 12, width: "100%" },
});
