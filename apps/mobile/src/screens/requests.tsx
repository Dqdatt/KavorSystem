import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Blur } from "../blur";
import { C, EASE, F, GL, glass, tint } from "../theme";
import { Gi, Ic } from "../icons";
import { Illus } from "../illus";
import { Avatar, Balanced, Btn, BtnRow, Card, Chip, Chips, Empty, InfoRow, LinkBtn, Seg, St, T, Tag, Timeline } from "../ui";
import { Foot, TabHead, TopBar, type ScreenSpec } from "../screen";
import { TYPE_ICON, type Approval, type MyReq } from "../data";
import { EXPLANATION_KINDS, STEP_RESOLVERS, type RequestItem } from "@kavor/contracts";
import { ACT, S, dayCount, go, leaveRange, reqSub, stamp } from "../store";

/* Luồng duyệt của đơn thật: "Đã gửi" + từng bước theo phiên bản workflow lúc gửi */
function flowOf(r: RequestItem): { steps: Array<[string, string]>; cur: number } {
  const steps: Array<[string, string]> = [["Đã gửi", stamp(r.submittedAt)], ...r.steps.map((s): [string, string] => {
    const who = s.resolver === "hr" ? STEP_RESOLVERS.hr : s.assignee ?? STEP_RESOLVERS.direct_manager;
    const sub = s.actedAt ? `${s.actedBy ?? who} · ${stamp(s.actedAt)}${s.comment ? ` · “${s.comment}”` : ""}`
      : s.status === "pending" ? `${who}${s.dueAt ? ` · hạn ${stamp(s.dueAt)}` : ""}`
      : s.status === "skipped" ? "Bỏ qua · không có người duyệt" : s.status === "cancelled" ? "Đã dừng" : who;
    return [s.resolver === "hr" ? "HR duyệt" : "Quản lý duyệt", sub];
  })];
  const k = r.steps.findIndex((s) => s.status === "pending" || s.status === "rejected" || (r.status === "cancelled" && s.status !== "approved" && s.status !== "skipped"));
  return { steps, cur: k < 0 ? steps.length - 1 : k + 1 };
}
const proposed = (r: Extract<RequestItem, { type: "explanation" }>) => [r.payload.clockIn ? `vào ${r.payload.clockIn}` : null, r.payload.clockOut ? `ra ${r.payload.clockOut}` : null].filter(Boolean).join(" · ") || "—";
/* Nội dung đơn theo loại: giải trình (giờ đề nghị, chấm công gốc) / nghỉ phép (loại, khoảng ngày, số ngày làm việc) */
function ReqRows({ r, approver }: { r: RequestItem; approver?: boolean }) {
  if (r.type === "leave") return <>
    <InfoRow k="Loại nghỉ" v={r.payload.leaveTypeName} strong />
    <InfoRow k="Thời gian" v={`${leaveRange(r.payload)} · ${dayCount(r.payload.days)} làm việc`} strong />
  </>;
  return <>
    {approver ? <InfoRow k="Loại đơn" v={`Giải trình · ${EXPLANATION_KINDS[r.payload.kind].toLowerCase()}`} strong /> : null}
    {approver ? <InfoRow k="Ngày" v={reqSub(r).split(" · ")[0]!} strong /> : null}
    <InfoRow k="Đề nghị ghi nhận" v={proposed(r)} strong />
    {r.day ? <InfoRow k="Chấm công gốc" v={`${approver && r.day.shift ? `${r.day.shift} · ` : ""}vào ${r.day.rawIn ?? "--:--"} · ra ${r.day.rawOut ?? "--:--"}`} strong /> : null}
  </>;
}

const Spacer = ({ h = 76 }: { h?: number }) => <View style={{ height: h }} />;

function Rq({ children, first, onPress, style }: { children: React.ReactNode; first?: boolean; onPress?: () => void; style?: object }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.rq, pressed && onPress && { backgroundColor: C.soft }, style]}>
      {!first ? <View style={styles.rqLine} /> : null}
      {children}
    </Pressable>
  );
}

function ReqTabSeg() {
  if (S.role !== "manager") return null;
  const n = S.approvals.length;
  return <Seg value={S.reqTab} onChange={(v) => ACT.reqTab(v as "mine" | "approve")} items={[["mine", "Của tôi"], ["approve", (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <T style={{ fontSize: 13.5, fontFamily: S.reqTab === "approve" ? F.semibold : F.medium, color: S.reqTab === "approve" ? C.ink : C.ink2 }}>Cần duyệt</T>
      {n ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.bad, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}><T style={{ color: "#fff", fontSize: 11, lineHeight: 14 }}>{n}</T></View> : null}
    </View>
  )]]} />;
}

export function requestsSpec(): ScreenSpec {
  if (S.role !== "manager") S.reqTab = "mine";
  if (S.reqTab === "approve") return approvalsSpec();
  const f = S.reqFilter, list = S.myReq.filter((r) => f === "all" || r.status === f);
  return {
    nav: true,
    head: <TabHead title="Đơn từ" />,
    body: [
      S.role === "manager" ? <ReqTabSeg key="seg" /> : null,
      <Chips key="chips">{([["all", "Tất cả"], ["pending", "Chờ duyệt"], ["approved", "Đã duyệt"], ["rejected", "Từ chối"], ["cancelled", "Đã hủy"]] as Array<[string, string]>).map((c) => <Chip key={c[0]} on={f === c[0]} label={c[1]} onPress={() => ACT.reqFilter(c[0])} />)}</Chips>,
      list.length ? <Card key="list">{list.map((r, i) => <MyRow key={r.id} r={r} first={i === 0} />)}</Card>
        : <Empty key="e" icon={<Gi n="file" s={44} />} title="Không có đơn nào" text="Đổi bộ lọc hoặc bấm nút + để tạo đơn mới." />,
    ],
  };
}

function MyRow({ r, first }: { r: MyReq; first: boolean }) {
  return (
    <Rq first={first} onPress={() => { S.param = r.id; go("reqDetail"); }}>
      <Gi n={TYPE_ICON[r.type]} s={24} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T style={{ fontFamily: F.semibold }}>{r.title}</T>
        <T style={{ color: C.ink2, fontSize: 12.5 }}>{r.sub}</T>
        <T style={{ color: C.ink3, fontSize: 12 }}>{r.id} · {r.created}</T>
      </View>
      <Tag st={r.status} />
    </Rq>
  );
}

function ApRow({ r, first }: { r: Approval; first: boolean }) {
  const sm = S.selectMode, on = S.sel.has(r.id);
  const leave = useRef(new Animated.Value(0)).current;
  const leaving = S.leavingCard === r.id;
  useEffect(() => { if (leaving) Animated.timing(leave, { toValue: 1, duration: 260, easing: EASE, useNativeDriver: true }).start(); }, [leaving]);
  return (
    <Animated.View style={{ opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: leave.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }] }}>
      <Rq first={first} onPress={sm ? () => ACT.selToggle(r.id) : undefined}>
        {sm ? <View style={[styles.cbx, on && styles.cbxOn]}>{on ? <Ic n="check" s={14} w={3} color="#fff" /> : null}</View> : <Gi n={TYPE_ICON[r.type]} s={24} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Avatar ini={r.ini} size="sm" /><T style={{ fontSize: 13, fontFamily: F.semibold }}>{r.who}</T></View>
          <T style={{ fontFamily: F.semibold, marginTop: 8 }}>{r.title}</T>
          <T style={{ color: C.ink2, fontSize: 12.5 }}>{r.sub}</T>
          <T style={{ color: C.ink3, fontSize: 12 }}>{r.ctx}</T>
          {sm ? null : (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Btn sm onPress={() => ACT.approve(r.id, true)}>Duyệt</Btn>
              <Btn sm kind="ghost" onPress={() => ACT.rejectAsk(r.id)}>Từ chối</Btn>
              <Btn sm kind="ghost" onPress={() => { S.param = r.id; go("approvalDetail"); }}>Chi tiết</Btn>
            </View>
          )}
        </View>
      </Rq>
    </Animated.View>
  );
}

function Bulk() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(v, { toValue: 1, speed: 14, bounciness: 8, useNativeDriver: true }).start(); }, []);
  return (
    <Animated.View style={[styles.bulk, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 26, overflow: "hidden" }]}>
        <Blur intensity={30} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.86), rgba(255,255,255,0.6))" }]} />
      </View>
      <T style={{ flex: 1, fontFamily: F.semibold }}>Đã chọn {S.sel.size}</T>
      <Btn sm kind="ghost" onPress={ACT.bulkReject}>Từ chối</Btn>
      <Btn sm onPress={ACT.bulkApprove}>{`Duyệt ${S.sel.size}`}</Btn>
    </Animated.View>
  );
}

function approvalsSpec(): ScreenSpec {
  const sm = S.selectMode, list = S.approvals;
  return {
    nav: true,
    head: <TabHead title="Đơn từ" />,
    body: [
      <ReqTabSeg key="seg" />,
      ...(list.length ? [
        <View key="hdr" style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, marginBottom: -10 }}>
          <T style={{ color: C.ink2 }}>{list.length} đơn chờ bạn</T>
          <LinkBtn size={14} onPress={ACT.selMode}>{sm ? "Xong" : "Chọn nhiều"}</LinkBtn>
        </View>,
        <Card key="list">{list.map((r, i) => <ApRow key={r.id} r={r} first={i === 0} />)}</Card>,
      ] : [<Empty key="e" icon={<Illus kind="approved" />} title="Không còn đơn cần duyệt" text="Đơn mới từ nhóm sẽ hiện ở đây và có thông báo cho bạn." />]),
      sm && S.sel.size ? <Spacer key="sp" h={60} /> : null,
    ],
    foot: sm && S.sel.size ? <Bulk key="bulk" /> : undefined,
  };
}

export function reqDetailSpec(): ScreenSpec {
  const it = S.reqItems.get(S.param ?? "");
  if (it) return remoteReqDetail(it);
  const r = S.myReq.find((x) => x.id === S.param) || S.myReq[0]!;
  const flow: Array<[string, string]> = r.type === "profile" ? [["Đã gửi", r.created], ["HR duyệt", "Mai Phương Thảo"]] : [["Đã gửi", r.created], ["Quản lý duyệt", "Lê Quang Huy"]];
  if (r.status === "rejected") flow[1]![1] = "Lý do: " + (r.note || "—");
  if (r.status === "cancelled") flow[1]![1] = "Đơn đã hủy";
  const stopped = r.status === "rejected" || r.status === "cancelled";
  return {
    head: <TopBar title={r.id} />,
    body: [
      <View key="c" style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
        <Gi n={TYPE_ICON[r.type]} s={44} w={1.5} />
        <T style={{ color: C.ink2, fontFamily: F.medium, textAlign: "center" }}>{r.title}</T>
        <Balanced style={{ fontSize: 20, fontFamily: F.bold, textAlign: "center" }}>{r.sub}</Balanced>
        <Tag st={r.status} />
      </View>,
      <Card key="info"><InfoRow k="Lý do" v={r.reason || "—"} strong /><InfoRow k="Gửi lúc" v={r.created} strong /></Card>,
      r.type === "profile" ? (
        <View key="two" style={{ flexDirection: "row", gap: 12 }}>
          <Card pad style={{ flex: 1 }}><T style={styles.fine}>Đang hiệu lực</T><T style={{ fontFamily: F.bold }}>Vietcombank</T><T>•6789</T></Card>
          <Card pad style={{ flex: 1, boxShadow: `${GL.sh}, inset 0px 0px 0px 2px ${C.violet}` }}><T style={styles.fine}>Đề nghị mới</T><T style={{ fontFamily: F.bold }}>Techcombank</T><T>•2231</T></Card>
        </View>
      ) : null,
      <Card key="tl" pad><Timeline steps={flow} cur={1} allDone={r.status === "approved"} fail={stopped} /></Card>,
      r.status === "pending" ? <Btn key="x" kind="danger" block onPress={() => ACT.cancelAsk(r.id)}>Hủy đơn</Btn> : null,
    ],
  };
}

function remoteReqDetail(r: RequestItem): ScreenSpec {
  const f = flowOf(r), stopped = r.status === "rejected" || r.status === "cancelled";
  return {
    head: <TopBar title={r.no} />,
    body: [
      <View key="c" style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
        <Gi n={TYPE_ICON[r.type === "leave" ? "leave" : "explain"]} s={44} w={1.5} />
        <T style={{ color: C.ink2, fontFamily: F.medium, textAlign: "center" }}>{r.type === "leave" ? r.payload.leaveTypeName : "Giải trình công"}</T>
        <Balanced style={{ fontSize: 20, fontFamily: F.bold, textAlign: "center" }}>{reqSub(r)}</Balanced>
        <Tag st={r.status} />
      </View>,
      <Card key="info">
        <ReqRows r={r} />
        <InfoRow k="Lý do" v={r.payload.reason} strong /><InfoRow k="Gửi lúc" v={stamp(r.submittedAt)} strong />
      </Card>,
      <Card key="tl" pad><Timeline steps={f.steps} cur={f.cur} allDone={r.status === "approved"} fail={stopped} /></Card>,
      r.canCancel ? <Btn key="x" kind="danger" block onPress={() => ACT.cancelAsk(r.no)}>Hủy đơn</Btn> : null,
    ],
  };
}

export function approvalDetailSpec(): ScreenSpec {
  const it = S.reqItems.get(S.param ?? "");
  if (it?.myTaskId && S.approvals.some((x) => x.id === it.no)) {
    const f = flowOf(it);
    return {
      head: <TopBar title={it.no} />,
      body: [
        <View key="c" style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
          <Avatar ini={S.approvals.find((x) => x.id === it.no)!.ini} size="lg" />
          <T style={{ fontSize: 20, fontFamily: F.bold, marginTop: 6 }}>{it.requester.fullName}</T>
          <T style={{ color: C.ink2 }}>{it.requester.code}{it.requester.department ? ` · ${it.requester.department}` : ""}</T>
          <St s="warn">Chờ bạn duyệt</St>
        </View>,
        <Card key="info">
          <ReqRows r={it} approver />
          <InfoRow k="Lý do" v={it.payload.reason} strong /><InfoRow k="Gửi lúc" v={stamp(it.submittedAt)} strong />
        </Card>,
        <Card key="tl" pad><Timeline steps={f.steps} cur={f.cur} /></Card>,
        <Spacer key="sp" />,
      ],
      foot: <Foot><BtnRow><Btn kind="ghost" onPress={() => ACT.rejectAsk(it.no)}>Từ chối</Btn><Btn spinKey="approve" onPress={() => ACT.approve(it.no)}>Duyệt</Btn></BtnRow></Foot>,
    };
  }
  const r = S.approvals.find((x) => x.id === S.param);
  if (!r) return { head: <TopBar title="Chi tiết đơn" />, body: [<Empty key="e" icon={<Illus kind="approved" />} title="Đơn này đã được xử lý" text="Bạn không cần duyệt lại." />] };
  return {
    head: <TopBar title={r.id} />,
    body: [
      <View key="c" style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
        <Avatar ini={r.ini} size="lg" />
        <T style={{ fontSize: 20, fontFamily: F.bold, marginTop: 6 }}>{r.who}</T>
        <T style={{ color: C.ink2 }}>{r.role} · Marketing</T>
        <St s="warn">Chờ bạn duyệt</St>
      </View>,
      <Card key="info"><InfoRow k="Loại đơn" v={r.title} strong /><InfoRow k="Nội dung" v={r.sub} strong /><InfoRow k="Lý do" v={r.reason} strong /><InfoRow k="Thông tin thêm" v={r.ctx} strong /><InfoRow k="Gửi lúc" v={r.created} strong /></Card>,
      r.type === "advance" ? <Card key="tl" pad><Timeline steps={[["Đã gửi", r.created], ["Quản lý duyệt", "Bạn"], ["HR duyệt", "Mai Phương Thảo"], ["Kế toán duyệt", "Đỗ Hồng Nhung"]]} cur={1} /></Card> : null,
      <Spacer key="sp" />,
    ],
    foot: <Foot><BtnRow><Btn kind="ghost" onPress={() => ACT.rejectAsk(r.id)}>Từ chối</Btn><Btn onPress={() => ACT.approve(r.id)}>Duyệt</Btn></BtnRow></Foot>,
  };
}

const styles = StyleSheet.create({
  rq: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 16, paddingHorizontal: 18, width: "100%" },
  rqLine: { position: "absolute", top: 0, left: 56, right: 18, height: 1, backgroundColor: C.line },
  cbx: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.line2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cbxOn: { ...tint, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  bulk: { position: "absolute", left: 18, right: 18, bottom: 104, zIndex: 35, borderRadius: 26, paddingVertical: 8, paddingRight: 8, paddingLeft: 20, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#fff", boxShadow: "0px 18px 40px -14px rgba(6,70,50,0.5)" },
  fine: { color: C.ink3, fontSize: 12 },
});
