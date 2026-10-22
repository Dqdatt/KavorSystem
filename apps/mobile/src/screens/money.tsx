import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { C, F } from "../theme";
import { Gi, Ic } from "../icons";
import { Btn, BtnRow, Card, Chip, Chips, ErrLine, Field, InfoRow, LinkBtn, Ln, Note, Num, Row, RowBtn, RowStrong, SecT, SectionHead, St, T, TbBtn, TextArea, Timeline } from "../ui";
import { Foot, TopBar, type ScreenSpec } from "../screen";
import { advLimit, groupThousands, netPay, sum, vnd } from "../data";
import { ACT, ADV_DAY, ADV_STEPS, S, advEligible, advError, emit, go, money } from "../store";

const EyeBtn = () => <TbBtn label="Ẩn hoặc hiện số tiền" onPress={ACT.hideMoney}><Ic n={S.hideMoney ? "eyeOff" : "eye"} s={20} /></TbBtn>;
const Cap = ({ children }: { children: string }) => <T style={{ textAlign: "center", color: C.ink2, fontSize: 13, fontFamily: F.medium }}>{children}</T>;
const Amt = ({ children, mt = 6, muted }: { children: string; mt?: number; muted?: boolean }) => <Num style={{ fontSize: 40, lineHeight: 44, fontFamily: F.light, letterSpacing: -0.8, color: muted ? C.ink3 : C.hero, textAlign: "center", marginTop: mt }}>{children}</Num>;
const Fine = ({ children, style }: { children: string; style?: object }) => <T style={[{ color: C.ink3, fontSize: 12, textAlign: "center", marginTop: 4 }, style]}>{children}</T>;
const Spacer = () => <View style={{ height: 76 }} />;

export function payslipsSpec(): ScreenSpec {
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

export function advanceSpec(): ScreenSpec {
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
